import requests

def send_telegram_message(chat_id: str, text: str) -> bool:
    token = Config.TELEGRAM_BOT_TOKEN
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text
    }
    response = requests.post(url, json=payload)
    return response.status_code == 200

def send_whatsapp_message(chat_id: str, text: str) -> bool:
    token = Config.WHATSAPP_BOT_TOKEN
    url = f"https://graph.facebook.com/v15.0/{chat_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": chat_id,
        "type": "text",
        "text": {
            "body": text
        }
    }
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    response = requests.post(url, json=payload, headers=headers)
    return response.status_code == 200

def send_push_notification(subscription_json: str, title: str, body: str, url: str = "/cabinet"):
    # Implementation for push notifications
    pass
