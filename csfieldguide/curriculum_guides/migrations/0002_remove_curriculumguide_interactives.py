# -*- coding: utf-8 -*-
# Generated by Django 1.11.16 on 2019-06-17 01:40
from __future__ import unicode_literals

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('curriculum_guides', '0001_initial'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='curriculumguide',
            name='interactives',
        ),
    ]
