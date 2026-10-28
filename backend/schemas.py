# Pydantic schemas
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr


# --- Auth Schemas ---
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    organization_name: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    org_id: int
    organization_name: Optional[str] = None

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


# --- Product Schemas ---
class ProductCreate(BaseModel):
    name: str
    sku: str
    description: Optional[str] = None
    quantity_on_hand: int = 0
    cost_price: float = 0.0
    selling_price: float = 0.0
    low_stock_threshold: Optional[int] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    description: Optional[str] = None
    quantity_on_hand: Optional[int] = None
    cost_price: Optional[float] = None
    selling_price: Optional[float] = None
    low_stock_threshold: Optional[int] = None


class ProductResponse(BaseModel):
    product_id: int
    org_id: int
    name: str
    sku: str
    description: Optional[str] = None
    quantity_on_hand: int
    cost_price: float
    selling_price: float
    low_stock_threshold: Optional[int] = None
    is_low_stock: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Dashboard Schemas ---
class DashboardSummary(BaseModel):
    total_products: int
    total_quantity: int
    low_stock_count: int
    low_stock_items: List[ProductResponse]


# --- Settings Schemas ---
class SettingsResponse(BaseModel):
    default_low_stock_threshold: int

    class Config:
        from_attributes = True


class SettingsUpdate(BaseModel):
    default_low_stock_threshold: int
