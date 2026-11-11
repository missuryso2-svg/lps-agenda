-- LPS Agenda — extensões e tipos base
-- Execute as migrações na ordem numérica. Nenhuma migração contém dados fictícios.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

create type public.barbershop_status as enum ('active', 'inactive', 'suspended');
create type public.barbershop_member_role as enum ('owner', 'staff');
create type public.appointment_status as enum (
  'scheduled',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show'
);
create type public.subscription_status as enum (
  'trialing',
  'active',
  'past_due',
  'canceled',
  'expired'
);
create type public.billing_interval as enum ('month', 'year');
create type public.payment_status as enum (
  'pending',
  'paid',
  'failed',
  'refunded',
  'cancelled'
);
create type public.payment_method as enum (
  'pix',
  'credit_card',
  'debit_card',
  'cash',
  'bank_transfer',
  'other'
);
create type public.notification_channel as enum ('in_app', 'email', 'whatsapp');
create type public.notification_status as enum ('pending', 'sent', 'failed', 'read');
create type public.webhook_status as enum ('received', 'processed', 'failed', 'ignored');
