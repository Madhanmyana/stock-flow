from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from database import engine, Base
import models
from routes import router

# Automatically create tables for all models
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="StockFlow API",
    description="Multi-Tenant Inventory Management API",
    version="1.0.0",
)

# Enable CORS for frontend integration (React, Next.js, Vite, etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
