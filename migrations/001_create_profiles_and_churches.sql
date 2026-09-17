-- Migration: Create profiles and churches tables for new registration system
-- Version: 001
-- Date: 2026-09-15
-- Description: Sets up profiles and churches tables with proper RLS, triggers, and security
-- IMPORTANT: This migration is ADDITIVE ONLY - does not modify existing student data

-- ============================================
-- EXTENSIONS
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================
-- CHURCHES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.churches (
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
    created_by UUID DEFAULT auth.uid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PROFILES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.profiles (
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
    
    -- Application-level role (separate from ministry role)
    app_role TEXT NOT NULL DEFAULT 'student' -- student, admin
);

-- Note: email is NOT duplicated here - auth.users.email is the authoritative source

-- Add foreign key constraint for churches.created_by (after profiles table exists)
ALTER TABLE public.churches 
    ADD CONSTRAINT churches_created_by_fkey 
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================
-- CHECK CONSTRAINTS
-- ============================================

-- Profiles check constraints
ALTER TABLE public.profiles 
    ADD CONSTRAINT check_ministry_role 
    CHECK (ministry_role IN ('pastor', 'minister', 'church_leader', 'other'));

ALTER TABLE public.profiles 
    ADD CONSTRAINT check_app_role 
    CHECK (app_role IN ('student', 'admin'));

ALTER TABLE public.profiles 
    ADD CONSTRAINT check_status 
    CHECK (status IN ('pending', 'active', 'suspended', 'rejected'));

ALTER TABLE public.profiles 
    ADD CONSTRAINT check_onboarding_step 
    CHECK (onboarding_step BETWEEN 1 AND 5);

ALTER TABLE public.profiles 
    ADD CONSTRAINT check_years_in_ministry 
    CHECK (years_in_ministry IS NULL OR years_in_ministry >= 0);

-- Churches check constraints
ALTER TABLE public.churches 
    ADD CONSTRAINT check_latitude 
    CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));

ALTER TABLE public.churches 
    ADD CONSTRAINT check_longitude 
    CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));

-- ============================================
-- INDEXES
-- ============================================

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_church_id ON public.profiles(church_id);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_step ON public.profiles(onboarding_step);
CREATE INDEX IF NOT EXISTS idx_profiles_app_role ON public.profiles(app_role);

-- Churches indexes
CREATE INDEX IF NOT EXISTS idx_churches_name ON public.churches USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_churches_location ON public.churches(country, admin_level_1, town);
CREATE INDEX IF NOT EXISTS idx_churches_created_by ON public.churches(created_by);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Helper function to check if current user is admin
-- This function is SECURITY DEFINER and bypasses RLS to prevent recursion
-- Created after profiles table exists for cleaner dependency ordering
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
    user_app_role TEXT;
BEGIN
    SELECT app_role INTO user_app_role
    FROM public.profiles
    WHERE id = auth.uid();
    
    RETURN COALESCE(user_app_role = 'admin', FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- TRIGGER FUNCTIONS
-- ============================================

-- Updated at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Protect created_by from being changed after creation
CREATE OR REPLACE FUNCTION public.protect_created_by()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent created_by from being changed after initial creation
    IF (OLD.created_by IS DISTINCT FROM NEW.created_by) THEN
        RAISE EXCEPTION 'created_by cannot be changed after creation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Protected fields trigger for profiles
-- Prevents normal users from updating app_role and status
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if user is trying to update protected fields
    IF (OLD.app_role IS DISTINCT FROM NEW.app_role) OR 
       (OLD.status IS DISTINCT FROM NEW.status) THEN
        -- Use the is_admin() helper function to avoid RLS recursion
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Unauthorized attempt to modify protected fields';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- TRIGGERS
-- ============================================

-- Add updated_at triggers
CREATE TRIGGER update_churches_updated_at BEFORE UPDATE ON public.churches
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Protect created_by from being changed
CREATE TRIGGER protect_churches_created_by BEFORE UPDATE ON public.churches
    FOR EACH ROW EXECUTE FUNCTION public.protect_created_by();

-- Protected fields trigger for profiles
CREATE TRIGGER protect_profile_fields_trigger
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS
ALTER TABLE public.churches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PROFILES RLS POLICIES
-- ============================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- Admins can view all profiles (using is_admin helper to avoid recursion)
CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT USING (public.is_admin());

-- Users can update their own profile (protected fields handled by trigger)
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Admins can update any profile
CREATE POLICY "Admins can update any profile" ON public.profiles
    FOR UPDATE USING (public.is_admin());

-- No direct INSERT policy for users - handled by trigger
-- Admins can insert profiles (for manual user creation)
CREATE POLICY "Admins can insert profiles" ON public.profiles
    FOR INSERT WITH CHECK (public.is_admin());

-- ============================================
-- CHURCHES RLS POLICIES
-- ============================================

-- Authenticated users can view churches (for search)
CREATE POLICY "Authenticated users can view churches" ON public.churches
    FOR SELECT USING (auth.role() = 'authenticated');

-- Authenticated users can create churches (for registration flow)
-- created_by must equal auth.uid() to prevent impersonation
CREATE POLICY "Authenticated users can create churches" ON public.churches
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated'
        AND created_by = auth.uid()
    );

-- Church creators can update their own churches
CREATE POLICY "Church creators can update own churches" ON public.churches
    FOR UPDATE USING (auth.uid() = created_by);

-- Admins can update any church
CREATE POLICY "Admins can update any church" ON public.churches
    FOR UPDATE USING (public.is_admin());

-- No direct DELETE policy - use merge function
CREATE POLICY "No direct church deletion" ON public.churches
    FOR DELETE USING (false);

-- ============================================
-- PROFILE CREATION TRIGGER
-- ============================================

-- Create automatic profile creation trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, ministry_role, app_role, status, onboarding_step)
    VALUES (
        NEW.id,
        COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), 'New User'),
        'other', -- Default ministry role
        'student', -- Default application role
        'pending', -- Default status
        1 -- Start at onboarding step 1
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on auth.users
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- CHURCH MERGE FUNCTION
-- ============================================

-- Church merge function (transactional, admin-only)
-- Authenticated users can call this RPC, but the database enforces admin authorization
CREATE OR REPLACE FUNCTION public.merge_churches(
    duplicate_church_id UUID,
    canonical_church_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Verify caller is admin using helper function
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can merge churches';
    END IF;
    
    -- Validate inputs
    IF duplicate_church_id IS NULL OR canonical_church_id IS NULL THEN
        RAISE EXCEPTION 'Both church IDs must be provided';
    END IF;
    
    IF duplicate_church_id = canonical_church_id THEN
        RAISE EXCEPTION 'Duplicate and canonical church IDs cannot be the same';
    END IF;
    
    -- Verify both churches exist
    IF NOT EXISTS (SELECT 1 FROM public.churches WHERE id = duplicate_church_id) THEN
        RAISE EXCEPTION 'Duplicate church does not exist';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM public.churches WHERE id = canonical_church_id) THEN
        RAISE EXCEPTION 'Canonical church does not exist';
    END IF;
    
    -- Reassign all profiles from duplicate to canonical
    UPDATE public.profiles
    SET church_id = canonical_church_id
    WHERE church_id = duplicate_church_id;
    
    -- Delete the duplicate church
    DELETE FROM public.churches
    WHERE id = duplicate_church_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- PERMISSIONS
-- ============================================

-- Revoke PUBLIC execution on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_created_by() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_profile_fields() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.merge_churches(UUID, UUID) FROM PUBLIC;

-- Grant execute on helper function to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Grant execute on merge_churches to authenticated users
-- Database function enforces admin authorization via is_admin()
GRANT EXECUTE ON FUNCTION public.merge_churches(UUID, UUID) TO authenticated;

-- Note: handle_new_user and trigger functions are NOT granted to authenticated users
-- They are only used by database triggers, which can execute them without grants
-- The frontend/admin panel can call merge_churches RPC using the logged-in admin's Supabase session

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.profiles IS 'User profiles for registration and onboarding';
COMMENT ON COLUMN public.profiles.ministry_role IS 'Ministry role: pastor, minister, church_leader, other';
COMMENT ON COLUMN public.profiles.app_role IS 'Application role: student, admin';
COMMENT ON COLUMN public.profiles.status IS 'Account status: pending, active, suspended, rejected';
COMMENT ON COLUMN public.profiles.onboarding_step IS 'Current onboarding step (1-5)';
COMMENT ON TABLE public.churches IS 'Church information for user registration';
COMMENT ON COLUMN public.churches.denomination IS 'Church denomination/affiliation';
COMMENT ON COLUMN public.churches.admin_level_1 IS 'State/Province/County';
COMMENT ON COLUMN public.churches.admin_level_2 IS 'District/Sub-county';
COMMENT ON FUNCTION public.is_admin() IS 'Helper function to check if current user is admin (bypasses RLS)';
COMMENT ON FUNCTION public.merge_churches IS 'Merge duplicate churches into canonical church (callable by authenticated, admin authorization enforced by is_admin())';