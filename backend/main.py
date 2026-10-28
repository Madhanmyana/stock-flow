from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from database import engine, Base
import models
from routes import router

# Automatically create all tables (Organizations, Users, Products) in Supabase/MySQL on boot
try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"Database initialization notice: {e}")

app = FastAPI(
    title="StockFlow API",
    description="Multi-Tenant Inventory Management API",
    version="1.0.0",
)

# Enable CORS for Vercel, localhost, and all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/", tags=["Health"])
def root():
    return {
        "status": "online",
        "service": "StockFlow Multi-Tenant API",
        "docs": "/docs"
    }

@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy"}

app.include_router(router)
