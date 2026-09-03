from fastapi import APIRouter, Depends

from .auth import get_current_user
from ..services.insights_service import compute_insights

router = APIRouter(prefix="/api/insights", tags=["insights"])


@router.get("/")
def get_insights(user_id: int = Depends(get_current_user)):
    return compute_insights(user_id)
