/** Parts of this file are heavily adapted from https://github.com/mrdoob/three.js/blob/dev/examples/webgl_materials_envmaps.html */

const THREE = require('three');
const mathjs = require('mathjs');
const OrbitControls = require('three-orbit-controls')(THREE);
const detector = require('../../../js/third-party/threejs/Detector.js');
const sprintf = require('sprintf-js').sprintf;
const urlParameters = require('../../../js/third-party/url-parameters.js');

const image_base_path = base_static_path + 'interactives/scene-editor/img/bridge-';
const SCALE = 100; // Multiplier for translation distances
const CAMERA_POINTERID = "thisobjectmarksthepointthecameraorbitsaround" // Longer than 20 characters as 20 is the limit for user input

const ROW_TEMPLATE = "%s & %s & %s";
const MATRIX_TEMPLATE = "\\begin{bmatrix} %s \\\\ %s \\\\ %s \\end{bmatrix}";

var controls, camera, scene, renderer;
var cameraCube, sceneCube;
var textureCube;
var cubeMesh;
var cameraPointer;
var suspect = null; // The object that the next transform will apply to
var screenObjectIds = {};
var screenObjectTransforms = {};

var numSpheres = 0;
var numCubes = 0;
var numCones = 0;
var ID = 0;

var mode;
var isStartingShape;

// check that the browser is webgl compatible
if (! detector.Detector.webgl) detector.Detector.addGetWebGLMessage();

// only show equations once they are rendered
// URL for mathjax script loaded from CDN
var mjaxURL  = 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.0/MathJax.js?config=TeX-AMS-MML_HTMLorMML,Safe.js';
// load mathjax script
$.getScript(mjaxURL);

rescaleCanvas();
init();
animate();
onWindowResize();

$(document).ready(function () {
  // mode = transform | translation | multiple | (default) scene-creation
  mode = urlParameters.getUrlParameter('mode');
  if (mode == "transform") {
    $("#matrix-container").removeClass('d-none');
    $("#eqtn-title").html(gettext('Transformation for sphere:'));
    $("#equation-container").removeClass('d-none');
  } else if (mode == "translation") {
    $("#vector-container").removeClass('d-none');
    $("#eqtn-title").html(gettext('Translation for sphere:'));
    $("#equation-container").removeClass('d-none');
  } else if (mode == "multiple") {
    $("#matrix-container").removeClass('d-none');
    $(".plus-sign").removeClass('d-none');
    $("#vector-container").removeClass('d-none');
    $("#eqtn-title").html(gettext('Multiple matrices and vectors:'));
    $("#equation-container").removeClass('d-none').addClass('col-md-8');
    $("#applied-container").removeClass('d-none');
  } else {
    mode = "scene-creation";
    $("#object-container").removeClass('d-none');
    $("#matrix-container").removeClass('d-none').addClass('offset-1 d-inline');
    $(".plus-sign").removeClass('d-none').addClass('d-inline');
    $("#vector-container").removeClass('d-none').addClass('d-inline');
    $("#equation-container").removeClass('d-none').addClass('col-md-8');
    $("#eqtn-title").addClass('d-none');
    $("#scene-creation-title-area").removeClass('d-none');
  }

  $("#selectable-objects").on('change', switchFocus);
  $("#colour-input").on('input', recolourHashBox);

  $("#add-object").click(newObject);
  $("#apply-transformation").click(applyTransformation);

  $("#colour-input").val('');
  $("#name-input").val('');
});

/**
 * Creates the new scene; skybox, lighting, camera and the initial object
 */
function init() {
  // Cameras
  camera = new THREE.PerspectiveCamera( 70, 16 / 9, 1, 100000 );
  camera.position.set( 1000, 500, 1000 );
  cameraCube = new THREE.PerspectiveCamera( 70, 16 / 9, 1, 100000 );
  camera.lookAt( new THREE.Vector3(0, 0, 0) );
  // Scene
  scene = new THREE.Scene();
  sceneCube = new THREE.Scene();
  // Lights
  var ambient = new THREE.AmbientLight( 0xffffff );
  scene.add( ambient );
  // Textures
  var urls = [ 
    image_base_path + "posx.jpg", image_base_path + "negx.jpg",
    image_base_path + "posy.jpg", image_base_path + "negy.jpg",
    image_base_path + "posz.jpg", image_base_path + "negz.jpg" 
  ];
  textureCube = new THREE.CubeTextureLoader().load( urls );
  textureCube.format = THREE.RGBFormat;
  textureCube.mapping = THREE.CubeReflectionMapping;
  textureCube.encoding = THREE.sRGBEncoding;

  var cubeShader = THREE.ShaderLib[ "cube" ];
  var cubeMaterial = new THREE.ShaderMaterial( {
    fragmentShader: cubeShader.fragmentShader,
    vertexShader: cubeShader.vertexShader,
    uniforms: cubeShader.uniforms,
    depthWrite: false,
    side: THREE.BackSide
  } );
  cubeMaterial.uniforms[ "tCube" ].value = textureCube;
  Object.defineProperty( cubeMaterial, 'map', {
    get: function () {
      return this.uniforms.tCube.value;
    }
  } );
  // Skybox
  cubeMesh = new THREE.Mesh( new THREE.BoxBufferGeometry( 100, 100, 100 ), cubeMaterial );
  sceneCube.add( cubeMesh );
  // Sphere object
  isStartingShape = true;
  var sphereMaterial = new THREE.MeshLambertMaterial( { envMap: textureCube } );
  addObject('sphere', sphereMaterial, '');
  // Camera orbit pointer
  addObject('tinyaxis', null, null);
  cameraPointer = scene.getObjectByName( CAMERA_POINTERID )
  //
  renderer = new THREE.WebGLRenderer();
  renderer.autoClear = false;
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
  var container = document.getElementById('scene');
  container.appendChild( renderer.domElement );
  renderer.gammaOutput = true;
  //
  controls = new OrbitControls( camera, renderer.domElement );
  controls.minDistance = 500;
  controls.maxDistance = 10000;
  controls.keys = {}; // Disable keyboard input
  // Grid
  var size = 10000;
  var divisions = 10;
  var colorCenterLine = 0xffffff;
  var colorGrid = 0xffffff;
  var gridHelper = new THREE.GridHelper( size, divisions, colorCenterLine, colorGrid );
  scene.add( gridHelper );
  // Axes
  addAxes(size);

  window.addEventListener( 'resize', onWindowResize, false );
}

/**
 * Rescales the scene to the size of the window
 * 
 * TEMPORARY: just rescales the canvas, keeping the 16:9 aspect ratio
 * TODO: Decide whether or not to stick to 16:9 and remove all the commented out stuff
 */
function onWindowResize() {
  rescaleCanvas();
  // camera.aspect = window.innerWidth / window.innerHeight;
  // camera.updateProjectionMatrix();
  // cameraCube.aspect = window.innerWidth / window.innerHeight;
  // cameraCube.updateProjectionMatrix();
  // renderer.setSize( window.innerWidth, window.innerHeight );
}

/**
 * Sets the canvas size appropriately, keeping an aspect ratio of 16:9
 */
function rescaleCanvas() {
  var canvas = $('#scene'); // canvas is the only thing in this div
  canvas.width(window.innerWidth - (window.innerWidth / 10)); // Leave some padding
  canvas.height(canvas.width() * 9 / 16);
}

/**
 * Animation loop for the scene
 */
function animate() {
  requestAnimationFrame( animate );
  var cameraTarget = controls.target;
  cameraPointer.position.set(cameraTarget.x, cameraTarget.y, cameraTarget.z);
  var distance = camera.position.distanceTo(cameraTarget);
  var scaleFactor = distance / (500 * SCALE); // Keep a constant size relative to the user
  cameraPointer.scale.set( scaleFactor, scaleFactor, scaleFactor );
  render();
}

/**
 * Renders the scene during the animation loop
 */
function render() {
  cameraCube.rotation.copy( camera.rotation );
  renderer.render( sceneCube, cameraCube );
  renderer.render( scene, camera );
}

/**
 * Adds lines to show the axes in the scene
 * Code taken from https://soledadpenades.com/articles/three-js-tutorials/drawing-the-coordinate-axes/
 */
function buildAxis( src, dst, colorHex, dashed ) {
  var geom = new THREE.Geometry();
  var mat;

  if(dashed) {
    mat = new THREE.LineDashedMaterial({ linewidth: 5, color: colorHex, dashSize: 25, gapSize: 50 });
  } else {
    mat = new THREE.LineBasicMaterial({ linewidth: 5, color: colorHex });
  }

  geom.vertices.push( src.clone() );
  geom.vertices.push( dst.clone() );

  var axis = new THREE.Line( geom, mat, THREE.LineSegments );
  axis.computeLineDistances(); // This one is SUPER important, otherwise dashed lines will appear as simple plain lines

  return axis;
}

/**
 * Creates axes in the scene
 */
function addAxes(size) {
  // positive X axis
  var posX = buildAxis(
    new THREE.Vector3( 0, 0, 0 ),
    new THREE.Vector3( size, 0, 0 ),
    0xFF0000,
    false
  );
  // negative X axis
  var negX = buildAxis(
    new THREE.Vector3( 0, 0, 0 ),
    new THREE.Vector3( -size, 0, 0 ),
    0xFF0000,
    true // ... we want this axis to be dashed
  );

  // positive Y axis
  var posY = buildAxis(
    new THREE.Vector3( 0, 0, 0 ),
    new THREE.Vector3( 0, size, 0 ),
    0x00FF00,
    false
  );
  // negative Y axis
  var negY = buildAxis(
    new THREE.Vector3( 0, 0, 0 ),
    new THREE.Vector3( 0, -size, 0 ),
    0x00FF00,
    true // ... we want this axis to be dashed
  );

  // positive Z axis
  var posZ = buildAxis(
    new THREE.Vector3( 0, 0, 0 ),
    new THREE.Vector3( 0, 0, size ),
    0x0000FF,
    false
  );
  // negative Z axis
  var negZ = buildAxis(
    new THREE.Vector3( 0, 0, 0 ),
    new THREE.Vector3( 0, 0, -size ),
    0x0000FF,
    true // ... we want this axis to be dashed
  );

  scene.add( posX );
  scene.add( negX );
  scene.add( posY );
  scene.add( negY );
  scene.add( posZ );
  scene.add( negZ );
}

/**
 * Parses user input for the type, name and colour of a new object, then adds it to the scene
 */
function newObject() {
  var objectType = $("#object-selection :selected").val();
  var name = $("#name-input").val();
  var colour = '0x' + $("#colour-input").val();
  if (colour == '0x') {
    colour = getRandomInt(0, 0xFFFFFF);
  } else {
    // This does not behave the same way as for HTML codes unless it is 6 digits
    colour = parseInt(colour);
    $("#colour-input").val(sixCharHex(colour)); // Show the real code for what was entered
  }
  var material = new THREE.MeshLambertMaterial( {color: colour} );
  addObject(objectType, material, name);
  $("#name-input").val('');
};

/**
 * Creates a new object in the scene with the following parameters:
 * 
 * @param {*} type     Shape type; cube, cone, sphere etc
 * @param {*} material A three.js material for the new object
 * @param {*} name     A name for the dropdown menu; if this is an empty
 *                     string a unique name will be generated,
 *                     if null then the object is not intended for the user
 *                     and will not be added to the list of selectable objects
 * 
 * If the name already exists, this function will be called recursively with a
 * plus symbol (+) appended to the name as a new name
 */
function addObject(type, material, name) {
  if (name in screenObjectIds) {
    // Object with that name/ID already exists
    // TODO: nicer solution
    addObject(type, material, name + '+');
    return;
  }
  var object;
  var geometry;
  switch (type) {
    case "sphere":
      geometry = new THREE.SphereBufferGeometry( 200, 48, 24 );
      object = new THREE.Mesh( geometry, material );
      scene.add( object );
      numSpheres += 1;
      if (name == '') {
        object.name = gettext('Sphere ') + numSpheres;
      } else {
        object.name = name;
      }
      break;

    case "cube":
      geometry = new THREE.BoxBufferGeometry(400, 400, 400 );
      object = new THREE.Mesh( geometry, material );
      scene.add( object );
      numCubes += 1;
      if (name == '') {
        object.name = gettext('Cube ') + numCubes;
      } else {
        object.name = name;
      }
      break;

    case "cone":
      geometry = new THREE.ConeBufferGeometry( 200, 400, 32 );
      object = new THREE.Mesh( geometry, material );
      scene.add( object );
      numCones += 1;
      if (name == '') {
        object.name = gettext('Cone ') + numCones;
      } else {
        object.name = name;
      }
      break;
    case "tinyaxis":
      name = null; // Name should always be null for this object as it will never be presented for user-manipulation
      object = createTinyaxisMesh();
      scene.add( object );
      break;
    default:
      return; // Not a valid shape
  }
  if (name == null) {
    object.name = CAMERA_POINTERID;
  }
  screenObjectIds[object.name] = 'obj' + (uniqueId());
  screenObjectTransforms[object.name] = [null, null];
  if (name != null) {
    $("#selectable-objects").append("<option id='" + screenObjectIds[object.name] + "'>" + object.name + "</option>");
    applyRandomTranslation(object);
    setSuspect(object);
  }
}

/**
 * The initial shape is left alone.
 * Any subsequent shape is randomly shifted by a translation matrix 
 */
function applyRandomTranslation(object) {
  if (!isStartingShape) {
    // Not the starting shape, so do move
    resetObject(object);
    var max = 30;
    var matrix4 = new THREE.Matrix4();

    var x = Math.floor(Math.random() * Math.floor(max)) * posOrNegative();
    var y = Math.floor(Math.random() * Math.floor(max)) * posOrNegative();
    var z = Math.floor(Math.random() * Math.floor(max)) * posOrNegative();

    matrix4.makeTranslation(x * SCALE, y * SCALE, z * SCALE);
    object.applyMatrix(matrix4);
    screenObjectTransforms[object.name] = [null, [x, y, z]];
  } else {
    isStartingShape = false;
  }
}

/**
 * Returns either 1 or -1 at random
 */
function posOrNegative() {
  return Math.random() < 0.5 ? -1 : 1;
}

/**
 * Applies the user-submitted transform and/or translation to the suspect object
 * in the scene
 */
function applyTransformation() {
  // Applied matrices need to be 4x4
  var matrix4 = new THREE.Matrix4();
  var transformMatrix;
  var translationVector;
  if (mode != "multiple") {
    resetObject(suspect);
  }

  if (mode == "transform") {
    // matrix only
    transformMatrix = getMatrix();
    matrix4.makeBasis(transformMatrix[0], transformMatrix[1], transformMatrix[2]);
    suspect.applyMatrix(matrix4);

  } else if (mode == "translation") {
    // vector only
    translationVector = getVector();
    matrix4.makeTranslation(translationVector[0], translationVector[1], translationVector[2]);
    suspect.applyMatrix(matrix4);

  } else if (mode == "multiple") {
    // One matrix and vector, but additive
    transformMatrix = getMatrix();
    translationVector = getVector();
    matrix4.makeBasis(transformMatrix[0], transformMatrix[1], transformMatrix[2]);
    if (!matrix4.equals(new THREE.Matrix4().identity())) {
      // Matrix is not the identity matrix (so there is a transform)
      suspect.applyMatrix(matrix4);
      addAppliedTransform(getMatrix(true));
    }
    matrix4.makeTranslation(translationVector[0], translationVector[1], translationVector[2]);
    if (!matrix4.equals(new THREE.Matrix4().identity())) {
      // Matrix is not the identity matrix (so there is a translation)
      suspect.applyMatrix(matrix4);
      addAppliedVector(getVector(true));
    }
    fillMatrices(true);

  } else if (mode == "scene-creation") {
    // one matrix and vector
    transformMatrix = getMatrix();
    translationVector = getVector();
    matrix4.makeBasis(transformMatrix[0], transformMatrix[1], transformMatrix[2]);
    suspect.applyMatrix(matrix4);
    matrix4.makeTranslation(translationVector[0], translationVector[1], translationVector[2]);
    suspect.applyMatrix(matrix4);
    screenObjectTransforms[suspect.name] = [getMatrix(true), getVector(true)];
  }
}

/**
 * Ensures the given object is selected (in the dropdown) if applicable
 * and sets up for the user to apply matrices to it
 */
function setSuspect(object) {
  if (suspect != null) {
    $("#" + screenObjectIds[suspect.name]).attr("selected", false);
  }
  suspect = object;
  $("#" + screenObjectIds[object.name]).attr("selected", true);

  if (mode != "multiple") {
    fillMatrices();
  }

  if (mode == "scene-creation") {
    $('#object-identifier').css({color: "#" + object.material.color.getHexString()}).html("&#x25D9;");
  }
}

/**
 * Called when the user selects an object to focus on.
 * Sets the selected object as the suspect
 */
function switchFocus() {
  var name = $("#selectable-objects").val();
  var object = scene.getObjectByName( name );
  setSuspect(object);
}

/**
 * Returns an integer it hasn't returned before
 * i.e. (the integer it returned last time + 1)
 */
function uniqueId() {
  ID++;
  return ID;
}

/**
 * Sets the transform matrices in the interactive to the values used to transform the currently selected object.
 * Only needed for scene-creation mode
 * 
 * If isReset, the matrices will be returned to their original status' (identity matrices) instead
 */
function fillMatrices(isReset) {
  var transform = screenObjectTransforms[suspect.name][0];
  if (transform != null && !isReset) {
    // Transform to be added
    $('#matrix-row-0-col-0').val(transform[0][0]);
    $('#matrix-row-0-col-1').val(transform[0][1]);
    $('#matrix-row-0-col-2').val(transform[0][2]);

    $('#matrix-row-1-col-0').val(transform[1][0]);
    $('#matrix-row-1-col-1').val(transform[1][1]);
    $('#matrix-row-1-col-2').val(transform[1][2]);

    $('#matrix-row-2-col-0').val(transform[2][0]);
    $('#matrix-row-2-col-1').val(transform[2][1]);
    $('#matrix-row-2-col-2').val(transform[2][2]);
  } else {
    $('#matrix-row-0-col-0').val(1);
    $('#matrix-row-0-col-1').val(0);
    $('#matrix-row-0-col-2').val(0);

    $('#matrix-row-1-col-0').val(0);
    $('#matrix-row-1-col-1').val(1);
    $('#matrix-row-1-col-2').val(0);

    $('#matrix-row-2-col-0').val(0);
    $('#matrix-row-2-col-1').val(0);
    $('#matrix-row-2-col-2').val(1);

  }

  var translation = screenObjectTransforms[suspect.name][1];
  if (translation != null && !isReset) {
    // Translation to be added
    $('#vector-row-0').val(translation[0]);
    $('#vector-row-1').val(translation[1]);
    $('#vector-row-2').val(translation[2]);
  } else {
    $('#vector-row-0').val(0);
    $('#vector-row-1').val(0);
    $('#vector-row-2').val(0);
  }
}

/**
 * Adds the given new matrix to the list of applied matrices, formatted appropriately with MathJax
 */
function addAppliedTransform(matrixStr) {
  var row1 = sprintf(ROW_TEMPLATE, matrixStr[0][0], matrixStr[1][0], matrixStr[2][0]);
  var row2 = sprintf(ROW_TEMPLATE, matrixStr[0][1], matrixStr[1][1], matrixStr[2][1]);
  var row3 = sprintf(ROW_TEMPLATE, matrixStr[0][2], matrixStr[1][2], matrixStr[2][2]);
  var newDiv = sprintf(MATRIX_TEMPLATE, row1, row2, row3);
  $("#applied-matrices").append(newDiv);
  MathJax.Hub.Queue(["Typeset", MathJax.Hub, "applied-matrices"]); // typeset calculated result
}

/**
 * Adds the given new vector to the list of applied matrices, formatted appropriately with MathJax
 */
function addAppliedVector(vectorStr) {
  var newDiv = sprintf(MATRIX_TEMPLATE, vectorStr[0], vectorStr[1], vectorStr[2]);
  $("#applied-matrices").append(newDiv);
  MathJax.Hub.Queue(["Typeset", MathJax.Hub, "applied-matrices"]); // typeset calculated result
}

/**
 * Sets the given object to the position [0, 0, 0], and removes any other tranformations
 */
function resetObject(object) {
  object.position.set( 0, 0, 0 );
  object.rotation.set( 0, 0, 0 );
  object.scale.set( 1, 1, 1 );
  object.updateMatrix();
}

/**
 * Returns a list of Vector3 objects, each being a column of the user-submitted matrix
 * If evalAsString is true, the values will be left as strings and a list of lists will be returned
 */
function getMatrix(evalAsString) {
  var col0, col1, col2;
  if (evalAsString) {
    col0 = [
      $('#matrix-row-0-col-0').val(),
      $('#matrix-row-1-col-0').val(),
      $('#matrix-row-2-col-0').val()
    ];

    col1 = [
      $('#matrix-row-0-col-1').val(),
      $('#matrix-row-1-col-1').val(),
      $('#matrix-row-2-col-1').val()
    ];

    col2 = [
      $('#matrix-row-0-col-2').val(),
      $('#matrix-row-1-col-2').val(),
      $('#matrix-row-2-col-2').val()
    ];

  } else {
    col0 = new THREE.Vector3(
      mathjs.eval($('#matrix-row-0-col-0').val()),
      mathjs.eval($('#matrix-row-1-col-0').val()),
      mathjs.eval($('#matrix-row-2-col-0').val())
    );

    col1 = new THREE.Vector3(
      mathjs.eval($('#matrix-row-0-col-1').val()),
      mathjs.eval($('#matrix-row-1-col-1').val()),
      mathjs.eval($('#matrix-row-2-col-1').val())
    );

    col2 = new THREE.Vector3(
      mathjs.eval($('#matrix-row-0-col-2').val()),
      mathjs.eval($('#matrix-row-1-col-2').val()),
      mathjs.eval($('#matrix-row-2-col-2').val())
    );
  }

  return [col0, col1, col2];
}

/**
 * Returns a list of three values, the x, y & z components of the user-submitted vector
 * If evalAsString is true, the values will be left as strings
 */
function getVector(evalAsString) {
  if (evalAsString) {
    return [
      $('#vector-row-0').val(),
      $('#vector-row-1').val(),
      $('#vector-row-2').val()
    ];
  }
  return [
    mathjs.eval($('#vector-row-0').val()) * SCALE,
    mathjs.eval($('#vector-row-1').val()) * SCALE,
    mathjs.eval($('#vector-row-2').val()) * SCALE
  ];
}

/**
 * Sets the colour of the prepended '#' box to the hexadecimal colour code entered in the input
 * Matches the behaviour of the colour chosen when the new object is created
 * i.e. assumes the code is zero-extended to 6 characters, rather than
 * following standard html colour code rules (such as that 3-digit codes are okay)
 */
function recolourHashBox() {
  var newColour = $("#colour-input").val();
  if (newColour == '') {
    $('#colour-input-label').css('background-color', '');
  } else {
    // sixCharHex to match the behaviour of the actual object
    $('#colour-input-label').css('background-color', '#' + sixCharHex(parseInt(newColour, 16)));
  }
}

/**
 * Returns the string of an integer as a zero-extended 6-character hexadecimal value
 * If the number is small, zeros will be appended to the front.
 * If the number is too big, a larger than 6-character string will be returned
 */
function sixCharHex(num) {
  var returnString = num.toString(16);
  if (returnString.length < 6) {
    return "0".repeat(6 - returnString.length) + returnString;
  } else {
    return returnString;
  }
}

/**
 * Returns a random number between min and max _inclusive_
 * From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random#Getting_a_random_integer_between_two_values_inclusive
 */
function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Returns the Mesh for a little xyz axis, to show the position the camera is orbiting
 * 
 * TODO (right now it just returns a red sphere as MVP)
 * https://threejsfundamentals.org/threejs/lessons/threejs-custom-geometry.html
 */
function createTinyaxisMesh() {

  var material = new THREE.MeshLambertMaterial( {color: 0xff0000} )
  var geometry = new THREE.SphereBufferGeometry( 200, 48, 24 );
  var object = new THREE.Mesh( geometry, material );
  return object;
}