"""Company accounts: request and response models."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

from app.schemas.entities import OrganizationRecord

Email = Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=5, max_length=254,
                                         pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
Password = Annotated[str, StringConstraints(min_length=8, max_length=72)]
License = Annotated[str, StringConstraints(strip_whitespace=True, min_length=4, max_length=40,
                                           pattern=r"^[A-Za-z0-9][A-Za-z0-9/\-. ]*$")]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
City = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SignupRequest(_Strict):
    company_name: Name
    city: City
    address: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None
    license_number: License
    email: Email
    password: Password

    @field_validator("address")
    @classmethod
    def _blank_to_none(cls, v: str | None) -> str | None:
        return v or None


class LoginRequest(_Strict):
    email: Email
    password: Annotated[str, StringConstraints(min_length=1, max_length=72)]


class RefreshRequest(_Strict):
    refresh_token: Annotated[str, StringConstraints(min_length=10, max_length=4096)]


class ResubmitRequest(_Strict):
    """A rejected company corrects its application and sends it again."""

    company_name: Name | None = None
    city: City | None = None
    address: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None
    license_number: License | None = None


class ProfileUpdate(_Strict):
    """Company details. Address and city apply at once; a new name or licence needs re-approval."""

    company_name: Name | None = None
    city: City | None = None
    address: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None
    license_number: License | None = None


class PasswordChange(_Strict):
    current_password: Annotated[str, StringConstraints(min_length=1, max_length=72)]
    new_password: Password


class ProfileUpdateResult(BaseModel):
    profile: Profile
    reapproval_required: bool


class RejectRequest(_Strict):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)]


class Profile(BaseModel):
    email: str
    role: Literal["admin", "company"]
    organization: OrganizationRecord | None = None


class Session(BaseModel):
    access_token: str
    refresh_token: str
    expires_at: int
    profile: Profile


ProfileUpdateResult.model_rebuild()
