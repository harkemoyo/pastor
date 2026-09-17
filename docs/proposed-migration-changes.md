# Proposed Migration Changes - Revised

## Summary of Corrections Made

### 1. ✅ Renamed `role` to `ministry_role`
- `ministry_role` = pastor, minister, church_leader, other
- `app_role` = student, admin
- Makes the two completely different concepts explicit

### 2. ✅ Fixed Profiles RLS UPDATE Policy
- Removed invalid OLD/NEW RLS expression
- Implemented database-level protection using BEFORE UPDATE trigger
- Normal users cannot change `app_role` or `status` via browser
- Protected fields: `app_role`, `status`

### 3. ✅ Fixed Church INSERT Authorization
- Policy renamed from "Admins can create churches" to "Authenticated users can create churches"
- Condition: `auth.role() = 'authenticated'` (correct for registration flow)
- Added validation: `created_by = auth.uid()` to prevent manipulation
- Allows users to create churches during registration with proper controls

### 4. ✅ Fixed Church Merge Authorization
- Function now verifies caller is admin internally
- Removed broad `GRANT EXECUTE` to all authenticated users
- Added admin check inside function using profiles.app_role
- Normal users cannot call merge function directly

### 5. ✅ Removed handle_new_user Execution Grant
- Removed: `GRANT EXECUTE ON FUNCTION public.handle_new_user TO authenticated`
- Function only used by auth.users trigger
- Not exposed as normal authenticated operation

### 6. ✅ Fixed Merge Logic
- Corrected sequence:
  1. Verify caller is admin
  2. Verify both church IDs exist and are different
  3. Reassign profiles from duplicate → canonical
  4. Handle church ownership references
  5. Delete duplicate church
  6. Return success
- Fixed logic error in church ownership handling
- Entire operation remains atomic (within function transaction)

### 7. ✅ Email Handling
- **Decision**: Do NOT duplicate email in profiles
- Authoritative source: `auth.users.email`
- No profiles.email column
- Email synchronization trigger created for future side effects
- Prevents inconsistent email data

### 8. ✅ Denomination Handling
- **Decision**: Keep denomination only in churches table
- `churches.denomination` = church's denomination/affiliation
- Removed profiles.denomination to avoid duplicate sources of truth
- If pastor's personal affiliation differs, can be added later with clear purpose

### 9. ✅ Auth Metadata Handling
- Only used `raw_user_meta_data.full_name` as initial fallback
- Authoritative data lives in public.profiles
- Auth metadata NOT used for:
  - ministry_role
  - app_role
  - status
  - church
  - location
  - approval

### 10. ✅ Two Authentication Systems Documented
- Created comprehensive analysis of current JSON system
- Identified all files that reference current auth
- Documented migration strategy in phases
- Plan to migrate responsibilities to Supabase Auth + profiles

### 11. ✅ Students Table Untouched
- Confirmed students table is empty and unused
- Will leave it untouched for now
- Creating separate profiles table for new system

### 12. ✅ Revised Migration Structure
- Split into two migration files:
  - `001_create_profiles_and_churches.sql` - Main schema
  - `002_email_synchronization.sql` - Email handling
- Added comprehensive comments
- Documented all functions, triggers, and policies

## Proposed Schema

### Profiles Table
```sql
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone TEXT,
    ministry_role TEXT NOT NULL DEFAULT 'other', -- pastor, minister, church_leader, other
    years_in_ministry INTEGER,
    church_id UUID REFERENCES public.churches(id) ON DELETE SET NULL,
    onboarding_step INTEGER DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, active, suspended, rejected
    onboarding_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    app_role TEXT NOT NULL DEFAULT 'student' -- student, admin
);
```

### Churches Table
```sql
CREATE TABLE public.churches (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    denomination TEXT, -- Church's denomination/affiliation
    country TEXT NOT NULL,
    admin_level_1 TEXT, -- State/Province/County
    admin_level_2 TEXT, -- District/Sub-county
    town TEXT NOT NULL,
    address TEXT,
    latitude NUMERIC,
    longitude NUMERIC,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Security Features

### RLS Policies
- **Profiles**: Users can only view/update own profile; admins can view/update all
- **Churches**: Authenticated users can view; users can create (as themselves); admins can update any

### Protected Fields
- **Database trigger** prevents normal users from updating `app_role` and `status`
- Admin verification inside merge function
- No direct church deletion (use merge function)

### Admin Authorization
- Checked via profiles.app_role = 'admin'
- Server-side verification, not client-side
- Applied in protected fields trigger and merge function

## Migration Files

1. **`migrations/001_create_profiles_and_churches.sql`**
   - Main schema creation
   - RLS policies
   - Triggers and functions
   - Indexes and extensions

2. **`migrations/002_email_synchronization.sql`**
   - Email update handling
   - Placeholder for future side effects

3. **`docs/current-authentication-system.md`**
   - Analysis of current JSON system
   - Migration strategy
   - Risk assessment

## Next Steps

**Pending your approval:**
1. Review the corrected SQL migration files
2. Confirm the security approach
3. Approve the migration strategy
4. Then proceed with Phase 2 implementation

The migration is designed to be:
- ✅ Secure (RLS, triggers, admin verification)
- ✅ Atomic (functions are transactional)
- ✅ Explicit (clear role naming, protected fields)
- ✅ Maintainable (version-controlled, well-documented)
- ✅ Compatible (doesn't break existing unused students table)