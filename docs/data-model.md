# Datamodell

## users
- id (integer)
- username (unique)
- password_hash
- role (`parent` | `child`)
- child_id (nullable)
- created_at
- updated_at

## children
- id (integer)
- name
- photo_url (nullable)
- created_at
- updated_at

## accounts
- id (integer)
- child_id (fk)
- type (`cash` | `fund`)
- created_at

## transactions
- id (integer)
- account_id (fk)
- type (`deposit` | `withdrawal`)
- amount_ore (integer > 0)
- date
- comment (required)
- created_by_user_id (fk users)
- created_at
- updated_at

## sessions_store
- sid
- sess
- expires

## schema_migrations
- id
- checksum
- applied_at
- down_sql
