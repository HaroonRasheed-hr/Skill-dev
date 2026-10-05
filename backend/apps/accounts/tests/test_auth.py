from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

PASSWORD = "Sup3r-Secret-Pass!"


class AuthTests(APITestCase):
    def setUp(self):
        cache.clear()  # reset throttle counters between tests

    def register(self, **overrides):
        payload = {
            "first_name": "Ada",
            "last_name": "Lovelace",
            "email": "Ada@Example.com",
            "username": "ada",
            "password": PASSWORD,
            "confirm_password": PASSWORD,
            "accept_terms": True,
            **overrides,
        }
        return self.client.post(reverse("accounts:register"), payload, format="json")

    def login(self, identifier, password=PASSWORD):
        return self.client.post(
            reverse("accounts:login"),
            {"identifier": identifier, "password": password},
            format="json",
        )

    def test_register_returns_user_and_tokens(self):
        res = self.register()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["user"]["email"], "ada@example.com")
        self.assertIn("access", res.data["tokens"])
        self.assertIn("refresh", res.data["tokens"])
        self.assertNotIn("password", res.data["user"])

    def test_register_rejects_mismatched_passwords(self):
        res = self.register(confirm_password="Different-Pass-123")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("confirm_password", res.data)

    def test_register_rejects_weak_password(self):
        res = self.register(password="123", confirm_password="123")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", res.data)

    def test_register_rejects_duplicate_email_case_insensitive(self):
        self.register()
        res = self.register(username="other", email="ADA@example.com")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", res.data)

    def test_register_rejects_duplicate_username_case_insensitive(self):
        self.register()
        res = self.register(username="ADA", email="other@example.com")
        self.assertIn("username", res.data)

    def test_register_requires_terms(self):
        res = self.register(accept_terms=False)
        self.assertIn("accept_terms", res.data)

    def test_login_with_username_or_email(self):
        self.register()
        self.assertEqual(self.login("ada").status_code, status.HTTP_200_OK)
        self.assertEqual(self.login("ADA@example.com").status_code, status.HTTP_200_OK)

    def test_login_bad_password(self):
        self.register()
        res = self.login("ada", "wrong-password")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_me_requires_auth(self):
        res = self.client.get(reverse("accounts:me"))
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_refresh_and_logout(self):
        tokens = self.register().data["tokens"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        self.assertEqual(self.client.get(reverse("accounts:me")).data["username"], "ada")

        res = self.client.post(
            reverse("accounts:token-refresh"), {"refresh": tokens["refresh"]}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        new_refresh = res.data["refresh"]

        res = self.client.post(reverse("accounts:logout"), {"refresh": new_refresh}, format="json")
        self.assertEqual(res.status_code, status.HTTP_205_RESET_CONTENT)

        res = self.client.post(
            reverse("accounts:token-refresh"), {"refresh": new_refresh}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
