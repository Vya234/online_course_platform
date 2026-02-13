🎓 Online Course Platform

A full-stack academic course management system designed to manage universities, courses, instructors, students, administrators, and data analysts using a centralized relational database.

This project was developed as part of the Database Management Systems (DBMS) Mini Project – IIT Kharagpur.
It demonstrates advanced database modeling, authentication, and modular backend architecture. 

** Features **

👩‍🎓 Student

-> Enroll in courses

-> Track progress & completion

-> View grades and feedback

-> Dashboard access

👨‍🏫 Instructor

-> Upload course content

-> Manage materials

-> Track student performance

🛠 Administrator

-> Manage users

-> Assign roles

-> Control permissions

📊 Data Analyst

-> Course analytics

-> Enrollment trends

-> Completion statistics

-> Performance metrics dashboard

🧠 Core Concepts Implemented

ISA Hierarchy (User → Student / Instructor / Admin / Analyst)

Many-to-Many Relationships
Associative Entities

Derived Statistics Engine

Role-Based Access Control (RBAC)

Secure Authentication using JWT

Password Hashing with bcrypt

Normalized Relational Database Design

🏗 System Architecture

Three-Tier Architecture :
Client Layer → Application Layer → Database Layer

Frontend: Static web dashboards

Backend: RESTful APIs

Database: PostgreSQL relational schema

🛠 Tech Stack

** Frontend **
 
    HTML5
    CSS3

** Backend **

    Node.js
    JWT Authentication
    bcrypt
    dotenv

** Database **

    PostgreSQL

🗄 Database Design Highlights

User Superclass with Specialized Roles

University–Course Relationship

Enrollment (Many-to-Many)

Teaching Assignment Model

Course Content Storage

Statistics Engine for Derived Metrics

🔐 Authentication & Security

Password Hashing using bcrypt

JWT Token-Based Authentication

Role-Based Access Control

Secure Route Protection

📂 Project Structure (Suggested)

online_course_platform/
│
├── frontend/
│   ├── index.html
│   ├── dashboard.html
│   └── assets/
│
├── backend/
│   ├── controllers/
│   ├── routes/
│   ├── models/
│   ├── middleware/
│   └── app.js
│
├── database/
│   ├── schema.sql
│   └── seed.sql
│
└── README.md

⚙️ How to Run the Project
1. Clone Repository
git clone https://github.com/Vya234/online_course_platform.git

cd online_course_platform

2. Backend Setup

cd backend

npm install

npm start

3. Database Setup

Install PostgreSQL

Create database:

CREATE DATABASE online_course_db;

Run schema scripts.

4. Frontend

Open index.html in browser.

📈 Functional Modules

Course Management

Enrollment Module

Instructor Module

Administrator Panel

Analyst Dashboard

🎯 Learning Outcomes

Advanced ER Modeling

PostgreSQL Query Design

Secure API Development

Modular Backend Structure

Full-Stack Integration

📌 Conclusion

This project demonstrates scalable database architecture, secure authentication mechanisms, and modular system design suitable for academic as well as real-world expansion.

👥 Team

Kavya Rai

Pravallika C

Amrutha D

Koncha Lavanya

Bhumika Rishitha M

