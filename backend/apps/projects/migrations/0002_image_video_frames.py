from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="image",
            name="video",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="image",
            name="frame_index",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="image",
            name="frame_time",
            field=models.FloatField(blank=True, null=True),
        ),
    ]
