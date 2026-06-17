# backend/app.py

"""
Instant Breakdown AI — Backend Server

This server does 3 things:
1. Receives selected text from the Chrome extension
2. Sends it to an AI model with a carefully crafted prompt
3. Returns a structured JSON breakdown

WHY Flask?
- Lightweight, easy to set up
- Perfect for API-only servers
"""

import os
import json
import re
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()  # Load .env file

app = Flask(__name__)

# CORS allows our Chrome extension to talk to this server.
# Without it, the browser blocks the request (security feature).
CORS(app, resources={r"/api/*": {"origins": "*"}})


# ============================================
# AI PROVIDER SETUP
# ============================================
# We support multiple AI providers. This makes it easy to switch.

AI_PROVIDER = os.getenv("AI_PROVIDER", "").lower()  # openai or groq (optional)

# Keep variables defined even if provider setup fails
client = None
MODEL = None

if AI_PROVIDER == "openai":
    try:
        from openai import OpenAI
        openai_key = os.getenv("OPENAI_API_KEY")
        if not openai_key:
            raise ValueError("OPENAI_API_KEY is not set")
        client = OpenAI(api_key=openai_key)
        MODEL = "gpt-4o-mini"  # Cheapest and fastest OpenAI model
    except Exception as e:
        print(f"❌ OpenAI init failed: {e}")

elif AI_PROVIDER == "groq":
    try:
        from openai import OpenAI  # Groq uses OpenAI-compatible API
        groq_key = os.getenv("GROQ_API_KEY")
        if not groq_key:
            raise ValueError("GROQ_API_KEY is not set")
        # Groq SDK has compatibility issues with Python 3.14, use httpx directly
        import httpx
        client = OpenAI(
            api_key=groq_key,
            base_url="https://api.groq.com/openai/v1",  # Point to Groq's server
            http_client=httpx.Client()
        )
        MODEL = "llama-3.1-8b-instant"  # Fast, free model on Groq
    except Exception as e:
        print(f"❌ Groq init failed: {e}")

else:
    print("⚠️  AI_PROVIDER is not set to 'openai' or 'groq' (or missing in .env).")

if client is not None and MODEL is not None:
    print(f"✅ AI Provider: {AI_PROVIDER} | Model: {MODEL}")
else:
    print("⚠️  AI provider is not configured correctly; /api/breakdown will be disabled.")


# ============================================
# THE PROMPT
# ============================================


SYSTEM_PROMPT = """You are a content analysis assistant. Your job is to take complex 
text and break it down into a clear, understandable, structured explanation that anyone can understand quickly and easily in just on click.

You MUST respond with valid JSON in this exact format:
{
  "topic": "A short title describing what the text is about (max 10 words)",
  "keyPoints": [
    "First key point (1/2 sentences)",
    "Second key point (1/2 sentences)",
    "Third key point (1/2 sentences)",
    "Forth key point (1/2 sentences)"
  ],
  "simpleExplanation": "A simple 3-4 sentence explanation that a 10-year-old could understand.",
  "newTermsWithMeaning": [
                            {
                                "term": "A technical word",
                                "definition": "clear explanation of it."
                            }, 
                            {
                                "term": "Another word",
                                "definition": "clear explanation of it."
                            }
                        ]
}

Rules:
- Keep the topic concise (under 10 words)
- Provide 3-5 key points, each as one to two clear sentence
- The simple explanation should avoid or keep minimum jargon
- Do not oversimplify the things, just keep balanced
- List 3-5 important technical terms or concepts with meaning
- If the text is very short or trivial, still provide a meaningful analysis
- ONLY output the JSON. No markdown, no code blocks, no extra text."""


def get_mode_instruction(mode):
    """
    Different modes change HOW the AI explains things.
    This lets users customize the breakdown style.
    """
    modes = {
        "simple": "Explain everything as simply as possible. Use everyday language.",
        "keypoints": "Focus heavily on extracting key points. Provide 5-7 points.",
        "deep": "Provide a thorough, detailed analysis. Include nuances and implications.",
        "eli5": "Explain like I'm 5 years old. Use analogies and very simple words."
    }
    return modes.get(mode, modes["deep"])


# ============================================
# API ENDPOINT
# ============================================

@app.route("/api/breakdown", methods=["POST"])
def breakdown():
    """
    Main endpoint that the Chrome extension calls.
    
    Expects JSON body: { "text": "...", "mode": "simple" }
    Returns JSON: { "topic": "...", "keyPoints": [...], ... }
    """
    try:
        if not client or not MODEL:
            return jsonify({"error": "AI provider not configured. Set AI_PROVIDER to 'openai' or 'groq' and provide API key"}), 503
        # 1. Get the request data
        data = request.get_json()
        
        if not data or "text" not in data:
            return jsonify({"error": "No text provided"}), 400
        
        text = data["text"].strip()
        mode = data.get("mode", "simple")
        
        # Don't process empty or very short text
        if len(text) < 10:
            return jsonify({"error": "Text too short to analyze"}), 400
        
        # Limit text length to avoid huge API bills
        if len(text) > 5000:
            text = text[:5000] + "... [truncated]"
        
        print(f"📝 Processing {len(text)} chars in '{mode}' mode")
        
        # 2. Build the prompt
        mode_instruction = get_mode_instruction(mode)
        user_prompt = f"{mode_instruction}\n\nAnalyze this text:\n\n{text}"
        
        # 3. Call the AI model
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,  # Low temperature = more focused, less creative
            max_tokens=1000    # Limit response length
        )
        
        # 4. Parse the AI response
        ai_text = response.choices[0].message.content.strip()
        
        # Clean up the response — sometimes AI wraps in code blocks
        ai_text = ai_text.strip()
        if ai_text.startswith("```"):
            ai_text = re.sub(r'^```(?:json)?\s*', '', ai_text)
            ai_text = re.sub(r'\s*```$', '', ai_text)
        
        # Parse JSON
        result = json.loads(ai_text)
        
        # 5. Validate the response has required fields
        required_fields = ["topic", "keyPoints", "newTermsWithMeaning","simpleExplanation"]
        for field in required_fields:
            if field not in result:
                result[field] = "Not available"

        if "keyPoints" not in result or result["keyPoints"] is None:
            result["ketPoints"] = ["No main key points extracted by AI."]
        elif isinstance(result["keyPoints"], str):
            result["keyPoints"] = [result["keyPoints"]]
        
        if "newTermsWithMeaning" not in result or not isinstance(result["newTermsWithMeaning"], list):
            result["newTermsWithMeaning"] = []
        
        
        print(f"✅ Breakdown generated: {result['topic']}")
        return jsonify(result)
    
    except json.JSONDecodeError as e:
        print(f"❌ JSON parse error: {e}")
        print(f"   Raw AI response: {ai_text[:200]}")
        # Fallback: return the raw text as a simple explanation
        return jsonify({
            "topic": "Analysis",
            "keyPoints": ["AI returned unstructured response"],
            "simpleExplanation": ai_text[:500],
            "newTermsWithMeaning": []
        })
    
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ============================================
# HEALTH CHECK
# ============================================

@app.route("/api/health", methods=["GET"])
def health():
    """Quick endpoint to check if the server is running."""
    return jsonify({
        "status": "ok",
        "provider": AI_PROVIDER,
        "model": MODEL
    })


# ============================================
# RUN THE SERVER
# ============================================

if __name__ == "__main__":
    print("\n🚀 Instant Breakdown AI Backend")
    print(f"   Provider: {AI_PROVIDER}")
    print(f"   Model: {MODEL}")
    print(f"   Server: http://localhost:5000")
    print(f"   Health: http://localhost:5000/api/health\n")
    
    app.run(debug=True, port=5000)