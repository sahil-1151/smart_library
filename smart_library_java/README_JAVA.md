# Smart Library Java Port

This project now uses the Swing frontend in the top-level `swing/` folder as the main UI.

## Current structure

- `src/smartlibrary/Main.java`: launcher that starts the Swing frontend
- `swing/SmartLibrarySwingApp.java`: main desktop UI entry point
- `swing/SmartLibraryService.java`: service layer for the new Swing frontend
- `swing/SmartLibraryRepository.java`: reads and writes the app's `.txt` data files
- `swing/SmartLibraryEmailClient.java`: approval email client used by the new UI
- `src/smartlibrary/*.java`: older data-structure and backend modules kept in the project

## Build and run

From `/Users/sahil/Desktop/smart_library_java`:

```bash
javac -d build src/smartlibrary/*.java swing/*.java
java -cp build smartlibrary.Main
```

You can also run the Swing app directly:

```bash
java -cp build smartlibrary.swing.SmartLibrarySwingApp
```

## Smoke test

If you want to confirm the new frontend package loads the project data without opening the window:

```bash
java -cp build smartlibrary.Main --smoke-test
```

## Notes

- The active frontend is `swing/SmartLibrarySwingApp.java`.
- The old console frontend file under `src/smartlibrary` has been removed.
- The app uses the same `data_book.txt`, `user_login.txt`, `admin_login.txt`, `issue_book.txt`, `issue_request.txt`, and `queue_book.txt` files from the project root.
- Running the Swing app from the project root keeps the data file paths correct.
