from flask import Flask
from app.db import init_db


def create_app():
    # Создаем экземпляр Flask и указываем папку instance для локальных настроек.
    app = Flask(__name__, instance_relative_config=True)

    # Инициализируем SQLite при старте приложения.
    init_db()

    # Регистрируем маршруты из routes.py.
    from app.routes import bp as main_bp

    app.register_blueprint(main_bp)
    return app
