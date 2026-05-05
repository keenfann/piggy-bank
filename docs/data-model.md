# Datamodell

## users
- id (uuid)
- username (unique)
- password_hash
- role (`FORALDER` | `BARN`)
- child_id (nullable)
- created_at

## children
- id (uuid)
- name
- photo_url (nullable)
- created_at

## accounts
- id (uuid)
- child_id (fk)
- type (`KONTANT` | `FOND`)
- currency (`SEK`)

## transactions
- id (uuid)
- account_id (fk)
- direction (`INSATTNING` | `UTTAG`)
- amount_ore (integer > 0)
- date
- comment (required)
- created_by_user_id (fk users)
- created_at
