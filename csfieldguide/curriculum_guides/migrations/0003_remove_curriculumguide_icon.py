# -*- coding: utf-8 -*-
# Generated by Django 1.11.16 on 2019-06-24 23:30
from __future__ import unicode_literals

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('curriculum_guides', '0002_remove_curriculumguide_interactives'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='curriculumguide',
            name='icon',
        ),
    ]
