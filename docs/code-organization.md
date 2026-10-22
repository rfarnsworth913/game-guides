# Code Organization

This document provides an overview of how content is organized within the project, including the structure of directories, files, and common conventions used throughout the codebase.

## Folder Structure

### Common

The `common` folder contains shared resources that are used across different parts of the project, such as constants, enums, and types. This helps maintain consistency and reduces duplication.

```bash
common/
├─ constants/
```

#### common/constants

The `constants` folder within `common` contains files that define constant values used throughout the project. This helps ensure consistency and makes it easier to manage values that are used in multiple places. For example, date formats can be defined here.

Some rules on formatting for constants:
* Use uppercase letters with underscores for constant names, e.g., `DATE_FORMAT`.
* Group related constants together in a single file.
* Avoid hardcoding values directly in the code; instead, reference the constants.
* Provide meaningful names that clearly indicate the purpose of the constant.
