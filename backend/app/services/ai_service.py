import os
from openai import OpenAI

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

SYSTEM_PROMPT = """You are Zuri, an intelligent AI financial assistant for a Nigerian fintech app.
You help users manage their money, track spending, set goals, send money, and make smart financial decisions.

Key context:
- Currency is Nigerian Naira (NGN), amounts are discussed in Naira
- Users can set savings goals, send money to beneficiaries, track expenses
- You are friendly, concise, and speak in a mix of English and Nigerian Pidgin when appropriate
- Always be helpful about budgeting, saving, and spending habits
- When users ask about actions (send money, create goal, etc.), provide clear guidance
- Keep responses under 200 words unless the user asks for detail

You can help with:
- Viewing balance and account info
- Creating and managing savings goals
- Sending money to beneficiaries
- Categorizing and reviewing transactions
- Financial advice and budgeting tips
- Setting up automations (auto-save, bill payments)
"""

client = None


def get_client():
    global client
    if client is None:
        client = OpenAI(api_key=OPENAI_API_KEY)
    return client


def chat_with_zuri(user_message: str, conversation_history: list = None) -> str:
    api_client = get_client()

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    if conversation_history:
        for msg in conversation_history[-10:]:
            messages.append({"role": msg["role"], "content": msg["text"]})

    messages.append({"role": "user", "content": user_message})

    try:
        response = api_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=500,
            temperature=0.7,
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"I'm having trouble connecting right now. Please try again in a moment. Error: {str(e)}"


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.wav") -> str:
    api_client = get_client()

    try:
        audio_file = (filename, audio_bytes, "audio/wav")
        response = api_client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
        )
        return response.text
    except Exception as e:
        return f"[Transcription error: {str(e)}]"
