Todo App – Task Manager



Overview

The Todo App is a modern, secure task management system designed to help users organize, track, and complete their daily tasks efficiently. Users can sign up, log in, create tasks with priorities and tags, mark tasks as done, and manage tasks in bulk. Built with simplicity and scalability in mind, it ensures both a smooth user experience and secure data handling.


Live Site: https://task-manager-inc.onrender.com/
________________________________________
Tech Stack


•	Backend: Node.js, Express.js
•	Database: PostgreSQL
•	Frontend: HTML, CSS, JavaScript
•	Security: bcrypt for password hashing, express-session for session management
________________________________________
Features

•	User Authentication: Sign up and login securely with hashed passwords.
•	Task Management: Add, edit, delete, and toggle tasks.
•	Bulk Operations: Delete or mark multiple tasks as done at once.
•	Tags & Priorities: Organize tasks by tags and priority levels.
•	Session Management: Keep users logged in securely with express-session.
•	Responsive UI: Works on both desktop and mobile devices.
________________________________________
Getting Started

1. Clone the Repository

git clone https://github.com/Scott_Pharcy/todo-app.git
cd todo-app

2. Install Dependencies

npm install


3. Set Up Environment Variables

Create a .env file in the root directory:
DB_USER=your_db_username
DB_PASSWORD=your_db_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_db_name
SESSION_SECRET=your_secret_here


4. Run the App Locally

node server.js
Open your browser at:
http://localhost:3000

________________________________________

Database Schema

Users Table

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  surname VARCHAR(100),
  email VARCHAR(150) UNIQUE,
  password VARCHAR(255)
);


Tasks Table

CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  title VARCHAR(255),
  description TEXT,
  priority VARCHAR(50),
  due_date DATE,
  tags TEXT[],
  done BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

________________________________________


Security Notes

•	Passwords are hashed using bcrypt.
•	Sessions are managed with express-session.
•	Sensitive credentials are stored in a .env file, which is ignored in .gitignore.


________________________________________

Contribution

1.	Fork the repository.
2.	Create a branch for your feature: git checkout -b feature-name
3.	Commit your changes: git commit -m "Add feature"
4.	Push to your branch: git push origin feature-name
5.	Open a Pull Request.

