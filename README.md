# MARSAI - Official Project : The festival of 60-second short films created with AI

- An Express.js MVC project using a service layer.

## 🌌 Get started

Strap yourself in! You can get started with this project on your local machine by following the instructions below:

## 1. Clone Project

To infinity and beyond! 🚀 Before you take off, clone the repo and set it up:

```sh
git clone https://github.com/hichem-tlidjane/marsai-back.git
cd marsai-back
```

This will clone the repo, install dependencies in the project

```sh
npm install
```

## 2. Environment Variables Setup

```sh
cp env.example .env
```

Open the .env file and fill in the required values

Make sure you define at least:

```sh
MYSQL_ROOT_PASSWORD=your_root_password
MYSQL_DATABASE=your_database
MYSQL_USER=your_user
MYSQL_PASSWORD=your_password
MYSQL_PORT=3308
PHPMYADMIN_PORT=8080
```

## 3. Start Docker containers

```sh
docker compose up -d
```

This will start:

- 🗄 MySQL 8.4
- 🧰 phpMyAdmin
- 📦 Persistent Docker volume (db_data)

Access services

- MySQL
  - Host: localhost
  - Port: ${MYSQL_PORT} (default: 3308)
- phpMyAdmin
  - URL: http://localhost:8080 (or your custom PHPMYADMIN_PORT)

Stop containers

```sh
docker compose down
```

To remove volumes as well:

```sh
docker compose down -v
```

## 4. 🌱 Seed the Admin User

This project includes a database seeding script to create the initial admin account.

Set your admin credentials
Make sure your .env file contains:

```sh
ADMIN_EMAIL=your_admin_email@example.com
ADMIN_PASSWORD=your_secure_password
```

Run the seed script

```sh
npm run seed
```
## 6. SCALEWAY Environment Variables Setup

Access to Scaleway PDF on google drive to fill environment variables:

SCALEWAY_ACCESS_KEY=
SCALEWAY_SECRET_KEY=
SCALEWAY_ENDPOINT=https://s3.fr-par.scw.cloud
SCALEWAY_BUCKET_NAME=
SCALEWAY_REGION=
SCALEWAY_FOLDER=

## 6. Sending Emails (Development Mode)

In development, emails are not sent to real inboxes. We use Ethereal Email
to test emails.

Make sure your .env file contains:

```sh
NODE_ENV=development
```

Run the API

```sh
npm run dev
```

Use Postman to trigger emails:

Go to the Postman workspace: https://speeding-comet-355366.postman.co/workspace/MarsAi~5fc2d72d-855e-4528-9b92-5e0c57ce7d01/request/23372108-38edc851-9fcc-4599-8f97-2db3303944aa

Run the following endpoints:

- Subscribe (POST) → subscribe a new user
- Newsletter (POST) → send a test newsletter
- Check the terminal logs to retrieve the Ethereal account credentials (email and password).

Access the Ethereal inbox: https://ethereal.email/

- Log in with the credentials from the terminal logs.
- You can now see all emails sent from the API in your test inbox.

⚠️ Notes :

- This method is for development only; no real emails are sent.
- Every time you restart the server, new Ethereal credentials may be generated.
