create table if not exists documents (
  kind text not null,
  id text not null,
  version integer not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);

create table if not exists events (
  id text primary key,
  operation_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists events_operation_idx on events (operation_id, created_at);
