# 0109 security fixes — local check (stand-in Supabase pieces)

A throwaway Postgres with small stand-ins for `auth.uid()`, `app.has_perm`, storage and the touched tables, to see the migration block the abuse the audit described and still allow normal use.

```
createdb t
psql -d t -f setup.sql                                   # stand-in schema with the policies as they were before 0109
psql -d t -f ../../migrations/0109_security_leads_1_to_4.sql
psql -d t -A -t -f run.sql                               # expect: portal sees 0 objects; crew sees only their own jobs' photos;
                                                         # the pricing user's access matrix edit is ignored; portal quotation content edit is refused;
                                                         # ocular assignee cannot set client_ok or move a photo; the office can
```
Run it BEFORE applying 0109 to see the original behaviour (portal sees every object, the pricing user grants itself admin.users, …).
