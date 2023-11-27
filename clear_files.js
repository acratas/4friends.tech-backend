const fs = require('fs');
const path = require('path');

const directories = [
  path.join(__dirname, 'cache'),
  path.join(__dirname, 'public', 'images', 'generated')
];

function cleanOldFiles(directory) {
  fs.readdir(directory, (err, files) => {
    if (err) {
      console.error(`Error reading directory: ${directory}`, err);
      return;
    }

    files.forEach(file => {
      const filePath = path.join(directory, file);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error(`Error getting file stats: ${filePath}`, err);
          return;
        }

        const oneHourAgo = Date.now() - (60 * 60 * 1000);  // 60 minutes * 60 seconds * 1000 milliseconds

        if (stats.mtime.getTime() < oneHourAgo) {
          fs.unlink(filePath, err => {
            if (err) {
              console.error(`Error deleting file: ${filePath}`, err);
            } else {
              console.log(`Deleted old file: ${filePath}`);
            }
          });
        }
      });
    });
  });
}

function main() {
  directories.forEach(directory => {
    cleanOldFiles(directory);
  });
}


main();


setInterval(main, 5 * 60 * 1000);  // 5 minutes * 60 seconds * 1000 milliseconds
