# Security

## Supported version

Only latest published version receives security fixes.

## Reporting

Do not open public issue for suspected vulnerability. Use GitHub private vulnerability reporting on this repository.

Include affected version, reproduction steps, impact, and smallest safe proof.

## Trust boundaries

Pi extensions execute with current user's permissions. Review package source before installation.

Pi Design Mode restricts SVG syntax and external resource loading, validates XML offline, hashes saved SVG artifacts, rejects path traversal and symbolic-link storage roots, and requires UI confirmation before changing protected-region status.

Region protection is workflow integrity, not operating-system isolation. Other processes running as same user can modify files. Hash mismatches stop further editing rather than silently trusting changed artifacts.
