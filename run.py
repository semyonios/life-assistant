from app import create_app

# Создаем Flask-приложение через фабрику.
app = create_app()

if __name__ == "__main__":
    # Запуск локального сервера в режиме отладки.
    app.run(debug=True)
