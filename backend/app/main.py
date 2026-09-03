from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .database import init_db, seed_demo_data
from .routers import auth, account, goals, beneficiaries, transactions, settings, conversation


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed_demo_data()
    yield


app = FastAPI(
    title="Zuri API",
    description="AI-powered financial assistant for Nigeria",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(account.router)
app.include_router(goals.router)
app.include_router(beneficiaries.router)
app.include_router(transactions.router)
app.include_router(settings.router)
app.include_router(conversation.router)


@app.get("/")
def root():
    return {"message": "Zuri API is running", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "ok"}
