# API endpoints
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from models import User, Organization, Product
from schemas import (
    UserCreate,
    UserLogin,
    UserResponse,
    Token,
    ProductCreate,
    ProductUpdate,
    ProductResponse,
    DashboardSummary,
    SettingsResponse,
    SettingsUpdate,
)
from security import hash_password, verify_password, create_access_token
from dependencies import get_db, get_current_user

router = APIRouter()


# --- Helper ---
def to_product_response(product: Product, default_threshold: int) -> ProductResponse:
    threshold = (
        product.low_stock_threshold
        if product.low_stock_threshold is not None
        else default_threshold
    )
    return ProductResponse(
        product_id=product.product_id,
        org_id=product.org_id,
        name=product.name,
        sku=product.sku,
        description=product.description,
        quantity_on_hand=product.quantity_on_hand,
        cost_price=product.cost_price,
        selling_price=product.selling_price,
        low_stock_threshold=threshold,
        is_low_stock=product.quantity_on_hand <= threshold,
        created_at=product.created_at,
        updated_at=product.updated_at,
    )


# ==============================================================================
# AUTHENTICATION
# ==============================================================================
@router.post(
    "/auth/signup",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Authentication"],
)
def signup(user_data: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # 1. Create Organization
    org = Organization(name=user_data.organization_name)
    db.add(org)
    db.commit()
    db.refresh(org)

    # 2. Create User linked to Organization
    new_user = User(
        email=user_data.email,
        password=hash_password(user_data.password),
        org_id=org.id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return UserResponse(
        id=new_user.id,
        email=new_user.email,
        org_id=new_user.org_id,
        organization_name=org.name,
    )


@router.post("/auth/login", response_model=Token, tags=["Authentication"])
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user or not verify_password(user_data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/auth/me", response_model=UserResponse, tags=["Authentication"])
def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        org_id=current_user.org_id,
        organization_name=current_user.organization.name if current_user.organization else None,
    )


# ==============================================================================
# PRODUCTS (Multi-Tenant, strictly scoped to current_user.org_id)
# ==============================================================================
@router.post(
    "/products",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Products"],
)
def create_product(
    product_data: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Ensure SKU is unique within this organization
    existing = (
        db.query(Product)
        .filter(
            Product.org_id == current_user.org_id,
            Product.sku == product_data.sku,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Product with SKU '{product_data.sku}' already exists in your organization",
        )

    threshold = (
        product_data.low_stock_threshold
        if product_data.low_stock_threshold is not None
        else current_user.organization.default_low_stock_threshold
    )

    new_product = Product(
        org_id=current_user.org_id,
        name=product_data.name,
        sku=product_data.sku,
        description=product_data.description,
        quantity_on_hand=product_data.quantity_on_hand,
        cost_price=product_data.cost_price,
        selling_price=product_data.selling_price,
        low_stock_threshold=threshold,
    )
    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    return to_product_response(
        new_product, current_user.organization.default_low_stock_threshold
    )


@router.get("/products", response_model=List[ProductResponse], tags=["Products"])
def list_products(
    search: Optional[str] = Query(None, description="Search by product name or SKU"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Product).filter(Product.org_id == current_user.org_id)

    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            (Product.name.ilike(search_filter)) | (Product.sku.ilike(search_filter))
        )

    products = query.order_by(Product.created_at.desc()).all()
    default_threshold = current_user.organization.default_low_stock_threshold
    return [to_product_response(p, default_threshold) for p in products]


@router.get("/products/{product_id}", response_model=ProductResponse, tags=["Products"])
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = (
        db.query(Product)
        .filter(
            Product.product_id == product_id,
            Product.org_id == current_user.org_id,
        )
        .first()
    )
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )

    return to_product_response(
        product, current_user.organization.default_low_stock_threshold
    )


@router.put("/products/{product_id}", response_model=ProductResponse, tags=["Products"])
def update_product(
    product_id: int,
    product_data: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = (
        db.query(Product)
        .filter(
            Product.product_id == product_id,
            Product.org_id == current_user.org_id,
        )
        .first()
    )
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )

    # If SKU is updated, ensure uniqueness within org
    if product_data.sku and product_data.sku != product.sku:
        existing = (
            db.query(Product)
            .filter(
                Product.org_id == current_user.org_id,
                Product.sku == product_data.sku,
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Product with SKU '{product_data.sku}' already exists in your organization",
            )

    update_dict = product_data.dict(exclude_unset=True)
    for field, val in update_dict.items():
        setattr(product, field, val)

    db.commit()
    db.refresh(product)
    return to_product_response(
        product, current_user.organization.default_low_stock_threshold
    )


@router.delete("/products/{product_id}", tags=["Products"])
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = (
        db.query(Product)
        .filter(
            Product.product_id == product_id,
            Product.org_id == current_user.org_id,
        )
        .first()
    )
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )

    db.delete(product)
    db.commit()
    return {"message": "Product deleted successfully"}


# ==============================================================================
# DASHBOARD
# ==============================================================================
@router.get("/dashboard/summary", response_model=DashboardSummary, tags=["Dashboard"])
def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    products = (
        db.query(Product)
        .filter(Product.org_id == current_user.org_id)
        .all()
    )

    default_threshold = current_user.organization.default_low_stock_threshold
    formatted_products = [to_product_response(p, default_threshold) for p in products]

    total_products = len(formatted_products)
    total_quantity = sum(p.quantity_on_hand for p in formatted_products)
    low_stock_items = [p for p in formatted_products if p.is_low_stock]

    return DashboardSummary(
        total_products=total_products,
        total_quantity=total_quantity,
        low_stock_count=len(low_stock_items),
        low_stock_items=low_stock_items,
    )


# ==============================================================================
# SETTINGS
# ==============================================================================
@router.get("/settings", response_model=SettingsResponse, tags=["Settings"])
def get_settings(current_user: User = Depends(get_current_user)):
    return SettingsResponse(
        default_low_stock_threshold=current_user.organization.default_low_stock_threshold
    )


@router.put("/settings", response_model=SettingsResponse, tags=["Settings"])
def update_settings(
    settings_data: SettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user.organization.default_low_stock_threshold = (
        settings_data.default_low_stock_threshold
    )
    db.commit()
    db.refresh(current_user.organization)
    return SettingsResponse(
        default_low_stock_threshold=current_user.organization.default_low_stock_threshold
    )
