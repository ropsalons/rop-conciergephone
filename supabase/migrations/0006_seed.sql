-- ROP Connect — Seed data: roles, locations, departments, default channels.
-- Idempotent so it is safe to re-run.

insert into public.roles (key, label, rank, description) values
  ('owner',      'Owner / Admin',  100, 'Full access to everything, including the admin panel.'),
  ('admin',      'Administrator',   90, 'Manage users, channels, alerts and settings.'),
  ('leadership', 'Leadership',      40, 'Post announcements and urgent alerts company-wide.'),
  ('manager',    'Manager',         30, 'Run daily huddles, scheduling and guest recovery.'),
  ('operations', 'Operations',      20, 'Operations team.'),
  ('marketing',  'Marketing',       20, 'Marketing team.'),
  ('education',  'Education',        20, 'Education team — can post education updates.'),
  ('hr',         'Human Resources', 20, 'HR team.'),
  ('concierge',  'Concierge',       10, 'Front desk / guest concierge.'),
  ('stylist',    'Stylist',         10, 'Salon stylist.'),
  ('associate',  'Associate',       10, 'Salon associate — default role.')
on conflict (key) do update set label = excluded.label, rank = excluded.rank, description = excluded.description;

insert into public.locations (slug, name, sort_order) values
  ('bayfront',  'Bayfront',                 1),
  ('village',   'Village on Venetian Bay',  2),
  ('promenade', 'Promenade',                3)
on conflict (slug) do nothing;

insert into public.departments (slug, name) values
  ('leadership',       'Leadership'),
  ('styling',          'Styling'),
  ('concierge',        'Concierge'),
  ('guest-experience', 'Guest Experience'),
  ('education',        'Education'),
  ('marketing',        'Marketing'),
  ('operations',       'Operations'),
  ('hr',               'Human Resources')
on conflict (slug) do nothing;

-- Default channels -------------------------------------------------------------
with loc as (select slug, id from public.locations),
     dep as (select slug, id from public.departments)
insert into public.channels (slug, name, description, type, location_id, department_id, is_default)
values
  ('announcements',     'Announcements',      'Company-wide announcements from leadership.', 'announcement', null, null, true),
  ('all-locations',     'All Locations',      'Everyone across all three salons.',           'public',       null, null, true),
  ('urgent',            'Urgent',             'Time-sensitive alerts requiring attention.',  'announcement', null, null, true),
  ('daily-focus',       'Daily Focus',        'Today''s focus and priorities.',              'public',       null, null, true),
  ('wins-and-shoutouts','Wins & Shoutouts',   'Celebrate great work and guest wins.',        'public',       null, null, true),
  ('guest-experience',  'Guest Experience',   'Elevating every guest visit.',                'public',       null, null, true),
  ('scheduling',        'Scheduling',         'Open shifts, coverage and staffing.',         'public',       null, null, true),
  ('bayfront',          'Bayfront',           'Bayfront salon team.',                        'location',     (select id from loc where slug='bayfront'),  null, false),
  ('village',           'Village',            'Village on Venetian Bay salon team.',         'location',     (select id from loc where slug='village'),   null, false),
  ('promenade',         'Promenade',          'Promenade salon team.',                       'location',     (select id from loc where slug='promenade'), null, false),
  ('leadership',        'Leadership',         'Leadership team — private.',                  'private',      null, null, false),
  ('concierge',         'Concierge',          'Concierge and front desk team.',              'department',   null, (select id from dep where slug='concierge'),  false),
  ('education',         'Education',          'Education, classes and product knowledge.',   'department',   null, (select id from dep where slug='education'),   false),
  ('marketing',         'Marketing',          'Marketing and promotions.',                   'department',   null, (select id from dep where slug='marketing'),   false)
on conflict (slug) do nothing;
