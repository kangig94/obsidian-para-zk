---
type: resource
---

A translated and summarized paper. There is no fixed form, so use `#` sections freely as the material needs.
These headings are *content*, not enforced keys — para-zk reads the whole note via `key=body` and edits it
with `set` / `append` / `replace` (an h1 in the body does not split it into separate sections).

# Summary

OS-specific encryption (BitLocker, FileVault) is tied to one filesystem and OS, so the volumes don't
interoperate. VeraCrypt, the successor to TrueCrypt, is container-based and crosses OS and filesystem
boundaries.

# Method

A hidden partition is layered over a standard encrypted partition to provide plausible deniability.
exFAT gives cross-OS compatibility; NTFS needs a separate driver (e.g. Paragon) to read/write on macOS.

# Experiment

Encrypting on a USB 3.2 external SSD ran at ~400MB/s → ~43 min for 1TB.
A brand-new SSD finishes in under a second with a quick format. Mounting was confirmed on Android and iOS too.

# Notes

When part of the material becomes an idea worth keeping → create a Source or Permanent ZK note from this resource (Create ZK from resource); the new note references this resource and it stays put.
