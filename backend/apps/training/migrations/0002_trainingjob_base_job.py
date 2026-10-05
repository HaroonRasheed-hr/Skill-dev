import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("training", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="trainingjob",
            name="base_job",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name="+", to="training.trainingjob",
            ),
        ),
    ]
