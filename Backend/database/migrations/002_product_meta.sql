create table if not exists public.product_meta (
  product_id uuid primary key references public.products(id) on delete cascade,
  seller_email text,
  brand text,
  available_units integer,
  colors_available jsonb not null default '[]'::jsonb,
  technical_specs jsonb not null default '[]'::jsonb,
  terms_and_conditions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_product_meta_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_product_meta_updated_at on public.product_meta;
create trigger trg_product_meta_updated_at
before update on public.product_meta
for each row
execute function public.set_product_meta_updated_at();
