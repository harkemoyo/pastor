# Current Authentication System Analysis

## Current System: Local JSON-based Authentication

The existing application uses a local JSON file-based authentication system that needs to be migrated to Supabase Auth + profiles.

## Current Authentication Flow

### 1. Data Storage
- **Primary storage**: `data/users.json`
- **Fields**: username, email, password, full_name, role, approval_status, created_at
- **Role values**: 'student', 'admin'
- **Approval status values**: 'pending', 'approved', 'rejected'

### 2. Registration Flow
- **File**: `routes/auth.js`
- **Route**: POST `/register`
- **Process**:
  1. Collects full_name, email, password
  2. Generates username (p1000000+ format)
  3. Sets role to 'student'
  4. Sets approval_status to 'pending'
  5. Saves to `data/users.json`
  6. Shows success page (not logged in)

### 3. Login Flow
- **File**: `routes/auth.js`
- **Route**: POST `/login`
- **Process**:
  1. Checks username/password against `data/users.json`
  2. Verifies approval_status is 'approved'
  3. Creates session with user data
  4. Redirects to dashboard

### 4. Session Management
- **File**: `middleware/auth.js`
- **Session storage**: Express session (server-side)
- **Session fields**: id, username, email, full_name, role, initials
- **Auth check**: `requireAuth` middleware
- **Admin check**: `requireAdmin` middleware (checks role === 'admin')

### 5. Admin User Management
- **File**: `routes/admin.js`
- **Routes**:
  - GET `/admin/users` - List all users
  - GET `/admin/users/new` - Create user form
  - POST `/admin/users/new` - Create user (auto-approved)
  - GET `/admin/users/:username/edit` - Edit user form
  - POST `/admin/users/:username/edit` - Update user
  - POST `/admin/users/:username/delete` - Delete user
  - POST `/admin/users/:username/approve` - Approve user
  - POST `/admin/users/:username/reject` - Reject user

### 6. Authorization Checks
- **File**: `middleware/auth.js`
- **Function**: `requireAdmin(req, res, next)`
- **Check**: `req.session.user.role === 'admin'`
- **Usage**: Applied to admin routes

## Files That Reference Current Auth System

### 1. Core Authentication
- `routes/auth.js` - Registration, login, logout
- `middleware/auth.js` - Session management, auth checks
- `data/users.json` - User data storage

### 2. Admin Routes
- `routes/admin.js` - User management (all user operations)
- `views/admin/user-form.ejs` - User creation/editing forms
- `views/admin/users.ejs` - User listing and management

### 3. Views with Auth Checks
- `views/partials/header.ejs` - Admin menu visibility based on role
- `views/login.ejs` - Login form
- `views/register-success.ejs` - Registration success page

### 4. Other References
- `server.js` - Session configuration
- `routes/courses.js` - Uses `requireAuth` middleware

## Migration Strategy

### Phase 1: Database Setup
- Create profiles and churches tables
- Set up RLS, triggers, and security
- Keep existing JSON system functional

### Phase 2: Parallel Authentication
- Implement Supabase Auth alongside JSON system
- Add environment flag to switch between systems
- Test new authentication flow

### Phase 3: Data Migration
- Migrate existing users from JSON to Supabase
- Map username-based IDs to UUID-based auth.users
- Preserve approval statuses and roles

### Phase 4: Complete Transition
- Remove JSON authentication code
- Update all auth references to use Supabase
- Remove local JSON files
- Update admin interfaces

### Phase 5: Cleanup
- Remove JSON-based user management
- Update all middleware to use new system
- Remove deprecated code

## Key Differences Between Systems

### Current JSON System
- Username-based identification
- Local file storage
- Simple approval workflow
- Manual admin user creation
- No email verification
- No password reset

### New Supabase System
- Email-based identification
- Cloud database storage
- Multi-step onboarding
- Self-registration with approval
- Email verification built-in
- Password reset built-in
- Church/location data
- Ministry role tracking

## Risks and Considerations

1. **Username vs Email**: Current system uses username, new system uses email
2. **Data Loss**: Must ensure no user data is lost during migration
3. **Session Compatibility**: Need to handle session transition
4. **Admin Access**: Must preserve admin access during transition
5. **Backward Compatibility**: Consider if any external systems depend on current auth