# Pastors LMS

A Learning Management System designed for pastors and church leaders, providing theological training courses with progress tracking and interactive learning features.

## Features

- **Authentication System**: Supports both Supabase authentication and local JSON-based fallback auth
- **Course Management**: Multiple theological courses with modules and progress tracking
- **Progress Tracking**: Interactive topic completion with percentage calculations
- **Dashboard**: Overview of enrolled courses, tasks, and progress statistics
- **Demo Accounts**: Pre-configured student and admin accounts for testing

## Available Courses

1. **THEO 101** - Sound Doctrine & Biblical Theology (Current)
2. **CHUR 201** - Building a Healthy Church (Current)  
3. **PRCH 301** - Expository Preaching (Past)
4. **CARE 202** - Pastoral Care & Shepherding (Past)

## Tech Stack

- **Backend**: Node.js with Express.js
- **Frontend**: EJS templating engine
- **Database**: Supabase (with local JSON fallback)
- **Authentication**: Express sessions with Supabase Auth + local fallback

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file with the following variables:

```env
SUPABASE_URL=your-supabase-project-url
SUPABASE_ANON_KEY=your-supabase-anon-key
SESSION_SECRET=pastors-lms-secret-key-change-in-production
PORT=3000
```

## Running the Application

```bash
npm start          # Start production server
npm run dev        # Start with file watching for development
npm run seed       # Seed database with initial data
```

## Demo Credentials

- **Student**: pastor.james@church.org / demo1234
- **Admin**: admin@pastorslms.com / admin1234

## Project Structure

```
pastors-lms/
├── config/           # Supabase client configuration
├── data/            # Course content and user data
├── middleware/      # Authentication middleware
├── public/          # Static assets (CSS, JS, images)
├── routes/          # Express route handlers
├── views/           # EJS templates
└── server.js        # Main application server
```

## License

This project is designed for theological training purposes.# pastor
