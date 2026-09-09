# StudyAI — Adaptive AI Study Planner

A beginner-friendly React + Vite prototype for an adaptive study planner.

## Features
- Student onboarding: name, course, semester, daily study hours
- Add any number of subjects
- Subject inputs: difficulty, confidence, exam date, target mark
- Dynamic priority calculation
- Automatically generated daily timetable
- 3D-style Study Universe with your own subjects
- Progress tracking
- Mark sessions complete or missed
- Missed-session recovery
- Focus Mode / Pomodoro timer
- Rule-based AI Coach
- LocalStorage persistence
- Responsive premium dark UI

## Run
1. Extract the ZIP.
2. Open the extracted folder in VS Code.
3. Open the terminal.
4. Run:
   npm install
5. Then:
   npm run dev
6. Open the Local URL shown by Vite.

No backend or API key is required for this prototype.

## Priority engine
Priority is calculated dynamically from:
- Exam urgency: 40%
- Difficulty: 30%
- Weakness from confidence: 20%
- Target mark: 10%

This is a transparent rule-based prototype. A real AI API can be connected later.
