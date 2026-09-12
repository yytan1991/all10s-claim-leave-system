# ALL 10S EDU — Claim & Leave Management System

A staff self-service leave and expense-claim system, styled after Kakitangan's
e-Leave / e-Claim modules: a dark sidebar, card-based dashboard, status pills
(Pending / Approved / Rejected), and simple submit-and-track forms with
receipt/document uploads.

Built with React + Vite + Supabase (same stack as Edulook).

## Features

- **Staff self-service**
  - Clock in/out with a geolocation check against registered work locations
  - Apply for leave (date range, reason, optional/required attachment)
  - Apply for claims (amount, receipt upload, description)
  - Track status of every application/claim (Pending, Approved, Rejected, Cancelled)
  - Cancel a pending leave application
  - Team calendar: a month view showing who's approved or pending for leave,
    without exposing anyone's reason or attachments
  - Dashboard with leave balance per type and recent activity
- **Manager / Admin**
  - Approvals inbox: review and approve/reject leave & claims across the team
  - Attendance Log: daily clock-in/out log (late arrivals flagged in red) and
    a monthly summary (days present, days late, total hours) — both exportable
    to Excel (.xlsx)
  - History of past decisions
- **Admin**
  - Manage staff roles (staff / manager / admin)
  - Set each staff member's annual leave entitlement per leave type
  - Set each staff member's individual working start/end time — clocking in
    after their start time is automatically flagged late
  - Add/remove work locations (name, GPS coordinates, check-in radius) staff
    must be within to clock in or out
  - Configure leave types and claim types (add/remove, mark attachment-required)

## 1. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com) (or reuse an existing one).
2. Open the **SQL editor** and run the contents of `supabase/schema.sql`.
   This creates all tables, RLS policies, storage buckets, and seeds default
   leave/claim types.
3. Then run `supabase/migration_2_attendance.sql` — this adds attendance
   tracking (work locations, per-staff working hours, clock-in/out records).
4. Then run `supabase/migration_3_team_calendar.sql` — this adds a
   privacy-safe function so every staff member can see the team leave
   calendar without seeing each other's private reason/attachment fields.
5. Under **Authentication → Providers**, keep Email enabled. Invite your staff
   under **Authentication → Users → Invite user** (or let them sign up if you
   enable that instead) — a `profiles` row is created automatically for every
   new auth user, defaulting to the `staff` role.
6. Promote your own account to admin so you can manage the system:
   ```sql
   update profiles set role = 'admin' where email = 'your-email@example.com';
   ```
7. Add your centre as a work location — either through **Settings → Work
   locations** in the app once you're logged in (use the "Use my current
   location" button while standing at the centre), or directly via SQL:
   ```sql
   insert into work_locations (name, latitude, longitude, radius_meters)
   values ('ALL 10S EDU Cheras Centre', 3.0738, 101.7370, 50);
   ```

## 2. Configure the app

```bash
cp .env.example .env
```

Fill in your Supabase project URL and anon public key (found under
**Project Settings → API**).

## 3. Run locally

```bash
npm install
npm run dev
```

## 4. Deploy

Push to GitHub and deploy on Vercel (same as your other projects) — set the
two `VITE_SUPABASE_*` environment variables in the Vercel project settings.

```bash
npm run build
```

## Installing as an app (PWA)

The app is a Progressive Web App — staff can "install" it to their phone's
home screen and it opens full-screen, like a native app, with no App Store
or Play Store needed. Admin can keep using it as a normal website in a
desktop browser; nothing changes there.

**For staff on Android (Chrome):**
1. Open the site link in Chrome
2. Tap the **⋮** menu → **Install app** (or Chrome may show an "Install"
   banner automatically)
3. It now has its own icon on the home screen and opens without browser bars

**For staff on iPhone (Safari):**
1. Open the site link in Safari (must be Safari, not Chrome, for this to work on iOS)
2. Tap the **Share** button (square with an arrow, at the bottom)
3. Scroll down and tap **Add to Home Screen**
4. Tap **Add** — it now has its own icon and opens full-screen

Once installed, logging in and clocking in/out works exactly the same as in
the browser — it's the same app, just presented like a native one. On phone
screens, the bottom tab bar (Home / Attendance / Leave / Claims / More)
replaces the sidebar; "More" opens the rest (Team Calendar, Approvals,
Employees, Settings — whichever your role can see).

## Rebranding the app icon

If you ever change the logo, edit the SVG in `scripts/generate-icons.mjs`,
then regenerate all icon sizes with:

```bash
npm run generate-icons
```

## Notes on roles

- **staff** — can apply for leave/claims and see only their own records.
- **manager** — everything staff can do, plus the Approvals inbox (sees the
  whole team, not just direct reports — adjust the RLS policy in
  `schema.sql` if you need manager-scoped visibility later).
- **admin** — everything manager can do, plus Employees (role & leave
  balance management) and Settings (leave/claim type configuration).

## Extending

- **Manager-scoped approvals**: filter `leave_applications`/`claims` by
  `profiles.manager_id` instead of any manager seeing everyone.
- **Email notifications**: add a Supabase Edge Function triggered on
  insert/update to email the requester and approver (Kakitangan does this on
  every status change) — not built yet, ask any time to add it.
