-- Keep existing categories and add wellness; new drafts should not presume food.
begin;
alter table public.experiences drop constraint experiences_category_check;
alter table public.experiences add constraint experiences_category_check
  check (category in ('food','coffee','wellness','outdoors','culture','stay','other'));
alter table public.experiences alter column category set default 'other';
commit;
