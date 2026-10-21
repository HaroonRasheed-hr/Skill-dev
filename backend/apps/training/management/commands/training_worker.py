"""Background worker that trains queued jobs one at a time on the CPU.

    python manage.py training_worker          # run forever
    python manage.py training_worker --once   # train at most one job, then exit
"""
import time

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.training.runner import claim_next_job, fail_interrupted_jobs, run_job


class Command(BaseCommand):
    help = "Train queued models with MMDetection (CPU only)."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", help="Process at most one job and exit.")
        parser.add_argument("--poll", type=float, default=None, help="Seconds between queue checks.")

    def handle(self, *args, once=False, poll=None, **options):
        poll = poll or settings.TRAINING["POLL_SECONDS"]
        # One worker per machine: CPU training already uses every core.
        stale = fail_interrupted_jobs()
        if stale:
            self.stdout.write(self.style.WARNING(f"Marked {stale} interrupted job(s) as failed."))
        self.stdout.write("Training worker started (CPU). Waiting for jobs…")
        try:
            while True:
                job = claim_next_job()
                if job:
                    self.stdout.write(f"Training job {job.pk} '{job.name}' ({job.architecture})…")
                    run_job(job)
                    self.stdout.write(f"Job {job.pk} finished: {job.status}")
                if once:
                    return
                if not job:
                    time.sleep(poll)
        except KeyboardInterrupt:
            self.stdout.write("Worker stopped.")
