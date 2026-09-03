import base64
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from datetime import datetime

from ..database import get_db
from ..schemas import ConversationTextRequest, ConversationResponse
from ..services.ai_service import run_agent, transcribe_audio, synthesize_speech
from .auth import get_current_user

router = APIRouter(prefix="/api/conversation", tags=["conversation"])


def _speech_data_uri(text: str):
    audio_bytes = synthesize_speech(text)
    if not audio_bytes:
        return None
    return "data:audio/mp3;base64," + base64.b64encode(audio_bytes).decode("ascii")


@router.get("/history")
def get_history(user_id: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT role, text, timestamp FROM conversations WHERE user_id = ? ORDER BY timestamp ASC LIMIT 50",
        (user_id,),
    )
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"messages": rows}


@router.post("/text")
def send_text_message(req: ConversationTextRequest, user_id: int = Depends(get_current_user)):
    now = datetime.utcnow().isoformat()

    conn = get_db()
    cursor = conn.cursor()
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
    conn.commit()
    conn.close()

    ai_response = run_agent(req.text, user_id, history)

    response_time = datetime.utcnow().isoformat()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO conversations (user_id, role, text, timestamp) VALUES (?, 'assistant', ?, ?)",
        (user_id, ai_response, response_time),
    )
    conn.commit()
    conn.close()

    audio_base64 = _speech_data_uri(ai_response) if req.voice else None

    return {
        "user_message": ConversationResponse(role="user", text=req.text, timestamp=now),
        "assistant_message": ConversationResponse(
            role="assistant", text=ai_response, timestamp=response_time, audio_base64=audio_base64
        ),
    }


@router.post("/audio")
async def send_audio_message(file: UploadFile = File(...), user_id: int = Depends(get_current_user)):
    audio_bytes = await file.read()
    filename = file.filename or "audio.wav"

    transcription = transcribe_audio(audio_bytes, filename)

    now = datetime.utcnow().isoformat()

    conn = get_db()
    cursor = conn.cursor()
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
    conn.commit()
    conn.close()

    ai_response = run_agent(transcription, user_id, history)

    response_time = datetime.utcnow().isoformat()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO conversations (user_id, role, text, timestamp) VALUES (?, 'assistant', ?, ?)",
        (user_id, ai_response, response_time),
    )

    conn.commit()
    conn.close()

    audio_base64 = _speech_data_uri(ai_response)

    return {
        "transcription": transcription,
        "user_message": ConversationResponse(role="user", text=transcription, timestamp=now),
        "assistant_message": ConversationResponse(
            role="assistant", text=ai_response, timestamp=response_time, audio_base64=audio_base64
        ),
    }
