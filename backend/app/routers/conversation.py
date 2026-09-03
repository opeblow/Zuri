from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from datetime import datetime

from ..database import get_db
from ..schemas import ConversationTextRequest, ConversationResponse
from ..services.ai_service import chat_with_zuri, transcribe_audio
from .auth import get_current_user

router = APIRouter(prefix="/api/conversation", tags=["conversation"])


@router.post("/text")
def send_text_message(req: ConversationTextRequest, user_id: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()

    now = datetime.utcnow().isoformat()
    cursor.execute(
        "INSERT INTO conversations (user_id, role, text, timestamp) VALUES (?, 'user', ?, ?)",
        (user_id, req.text, now),
    )

    cursor.execute(
        "SELECT role, text FROM conversations WHERE user_id = ? ORDER BY timestamp DESC LIMIT 10",
        (user_id,),
    )
    history = [dict(r) for r in cursor.fetchall()]
    history.reverse()

    ai_response = chat_with_zuri(req.text, history)

    response_time = datetime.utcnow().isoformat()
    cursor.execute(
        "INSERT INTO conversations (user_id, role, text, timestamp) VALUES (?, 'assistant', ?, ?)",
        (user_id, ai_response, response_time),
    )

    conn.commit()
    conn.close()

    return {
        "user_message": ConversationResponse(role="user", text=req.text, timestamp=now),
        "assistant_message": ConversationResponse(role="assistant", text=ai_response, timestamp=response_time),
    }


@router.post("/audio")
async def send_audio_message(file: UploadFile = File(...), user_id: int = Depends(get_current_user)):
    audio_bytes = await file.read()
    filename = file.filename or "audio.wav"

    transcription = transcribe_audio(audio_bytes, filename)

    conn = get_db()
    cursor = conn.cursor()

    now = datetime.utcnow().isoformat()
    cursor.execute(
        "INSERT INTO conversations (user_id, role, text, timestamp) VALUES (?, 'user', ?, ?)",
        (user_id, f"[Audio] {transcription}", now),
    )

    cursor.execute(
        "SELECT role, text FROM conversations WHERE user_id = ? ORDER BY timestamp DESC LIMIT 10",
        (user_id,),
    )
    history = [dict(r) for r in cursor.fetchall()]
    history.reverse()

    ai_response = chat_with_zuri(transcription, history)

    response_time = datetime.utcnow().isoformat()
    cursor.execute(
        "INSERT INTO conversations (user_id, role, text, timestamp) VALUES (?, 'assistant', ?, ?)",
        (user_id, ai_response, response_time),
    )

    conn.commit()
    conn.close()

    return {
        "transcription": transcription,
        "user_message": ConversationResponse(role="user", text=transcription, timestamp=now),
        "assistant_message": ConversationResponse(role="assistant", text=ai_response, timestamp=response_time),
    }
