const { Bot } = require("grammy");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const bot = new Bot("7861507727:AAF0BQ4l5jOLEN1wysmhdf2owz0EXx5efZM");
const dbDir = path.join(__dirname, "database");
const userDir = path.join(__dirname, "users");

function createDataset(token, userId) {
    const datasetPath = path.join(dbDir, `${token}.json`);
    if (fs.existsSync(datasetPath)) {
        return { success: false, message: "Dataset already exists for this token." };
    }
    fs.writeFileSync(datasetPath, JSON.stringify({ data: {}, spaceUsed: 0 }));
    setUserDefaultToken(userId, token);
    return { success: true, message: `Dataset created for token: ${token}` };
}

function setUserDefaultToken(userId, token) {
    const userPath = path.join(userDir, `${userId}.json`);
    const userData = fs.existsSync(userPath) ? JSON.parse(fs.readFileSync(userPath)) : {};
    userData.defaultToken = token;
    fs.writeFileSync(userPath, JSON.stringify(userData));
}

function readDataset(token) {
    const datasetPath = path.join(dbDir, `${token}.json`);
    if (fs.existsSync(datasetPath)) {
        return JSON.parse(fs.readFileSync(datasetPath));
    }
    return null;
}

function writeDataset(token, data, spaceUsed) {
    const datasetPath = path.join(dbDir, `${token}.json`);
    fs.writeFileSync(datasetPath, JSON.stringify({ data, spaceUsed }));
}

function generateToken() {
    return crypto.randomBytes(16).toString("hex");
}

function getUserDefaultToken(userId) {
    const userPath = path.join(userDir, `${userId}.json`);
    if (fs.existsSync(userPath)) {
        const userData = JSON.parse(fs.readFileSync(userPath));
        return userData.defaultToken;
    }
    return null;
}

bot.command("start", (ctx) => {
    ctx.reply("Welcome! Use /create to create a token and dataset. Use /help for usage instructions.");
});

bot.command("create", async (ctx) => {
    const userId = ctx.from.id;
    const defaultToken = getUserDefaultToken(userId);

    if (defaultToken) {
        return ctx.reply(
            `You already have a default token: ${defaultToken}. Use /restore to set a new token or backup the old data.`
        );
    }

    const token = generateToken();
    const result = createDataset(token, userId);

    if (result.success) {
        ctx.reply(`New token created: ${token}\nDataset created for this token.`);
    } else {
        ctx.reply(result.message);
    }
});

bot.command("backup", async (ctx) => {
    const userId = ctx.from.id;
    const defaultToken = getUserDefaultToken(userId);

    if (!defaultToken) {
        return ctx.reply("You don't have any existing token to backup.");
    }

    const dataset = readDataset(defaultToken);
    if (!dataset) {
        return ctx.reply("No dataset found for your token.");
    }

    const backupToken = generateToken();
    fs.writeFileSync(path.join(dbDir, `${backupToken}.json`), JSON.stringify(dataset));

    ctx.reply(`Your data has been backed up to a new token: ${backupToken}`);
});

bot.command("restore", async (ctx) => {
    const userId = ctx.from.id;
    const args = ctx.message.text.split(" ").slice(1);

    if (args.length < 1) {
        return ctx.reply("Please provide a token to restore.");
    }

    const token = args[0];
    const dataset = readDataset(token);

    if (!dataset) {
        return ctx.reply("No dataset found for the provided token.");
    }

    setUserDefaultToken(userId, token);
    ctx.reply(`Token ${token} has been restored and set as your default.`);
});

bot.command("add", async (ctx) => {
    const userId = ctx.from.id;
    const defaultToken = getUserDefaultToken(userId);

    if (!defaultToken) {
        return ctx.reply("You don't have a default token. Please create or restore one.");
    }

    const args = ctx.message.text.split(" ");
    const dataFlagIndex = args.indexOf("--data");
    const keyFlagIndex = args.indexOf("--key");

    if (dataFlagIndex === -1 || keyFlagIndex === -1) {
        return ctx.reply("Please provide both --data and --key arguments.");
    }

    const data = args[dataFlagIndex + 1];
    const key = args[keyFlagIndex + 1];

    if (!data || !key) {
        return ctx.reply("Invalid data or key provided.");
    }

    try {
        const jsonData = JSON.parse(data);
        const dataset = readDataset(defaultToken);

        if (!dataset) {
            return ctx.reply("Dataset not found for your token.");
        }

        const id = uuidv4();
        dataset.data[id] = { key, value: jsonData };

        const newSpaceUsed = Buffer.byteLength(JSON.stringify(dataset.data), "utf8");

        if (newSpaceUsed > 10 * 1024 * 1024) {
            return ctx.reply("Dataset exceeds the 10MB space limit.");
        }

        writeDataset(defaultToken, dataset.data, newSpaceUsed);
        ctx.reply(`Data added to your dataset with ID: ${id}`);
    } catch (err) {
        ctx.reply("Invalid JSON format provided.");
    }
});

bot.command("get", async (ctx) => {
    const userId = ctx.from.id;
    const defaultToken = getUserDefaultToken(userId);

    if (!defaultToken) {
        return ctx.reply("You don't have a default token. Please create or restore one.");
    }

    const args = ctx.message.text.split(" ").slice(1);

    if (args.length < 1) {
        return ctx.reply("Please provide a key to retrieve.");
    }

    const key = args[0];
    const dataset = readDataset(defaultToken);

    if (!dataset) {
        return ctx.reply("Dataset not found for your token.");
    }

    const result = Object.entries(dataset.data).find(([id, record]) => record.key === key);
    if (result) {
        const [id, record] = result;
        ctx.reply(`Key: ${key}\nData: ${JSON.stringify(record.value)}`);
    } else {
        ctx.reply("Key not found.");
    }
});

bot.command("edit", async (ctx) => {
    const userId = ctx.from.id;
    const defaultToken = getUserDefaultToken(userId);

    if (!defaultToken) {
        return ctx.reply("You don't have a default token. Please create or restore one.");
    }

    const args = ctx.message.text.split(" ");
    const keyFlagIndex = args.indexOf("--key");
    const dataFlagIndex = args.indexOf("--data");

    if (keyFlagIndex === -1 || dataFlagIndex === -1) {
        return ctx.reply("Please provide both --key and --data arguments.");
    }

    const key = args[keyFlagIndex + 1];
    const newData = args[dataFlagIndex + 1];

    if (!key || !newData) {
        return ctx.reply("Invalid key or data provided.");
    }

    try {
        const jsonData = JSON.parse(newData);
        const dataset = readDataset(defaultToken);

        if (!dataset) {
            return ctx.reply("Dataset not found for your token.");
        }

        const record = Object.entries(dataset.data).find(([id, record]) => record.key === key);
        if (record) {
            const [id, existingRecord] = record;
            existingRecord.value = jsonData;
            const newSpaceUsed = Buffer.byteLength(JSON.stringify(dataset.data), "utf8");

            if (newSpaceUsed > 10 * 1024 * 1024) {
                return ctx.reply("Dataset exceeds the 10MB space limit.");
            }

            writeDataset(defaultToken, dataset.data, newSpaceUsed);
            ctx.reply(`Data for key ${key} has been updated.`);
        } else {
            ctx.reply("Key not found.");
        }
    } catch (err) {
        ctx.reply("Invalid JSON format provided.");
    }
});

bot.command("clear", async (ctx) => {
    const userId = ctx.from.id;
    const defaultToken = getUserDefaultToken(userId);

    if (!defaultToken) {
        return ctx.reply("You don't have a default token. Please create or restore one.");
    }

    const dataset = readDataset(defaultToken);

    if (!dataset) {
        return ctx.reply("Dataset not found for your token.");
    }

    writeDataset(defaultToken, {}, 0);
    ctx.reply("All data has been cleared.");
});

bot.command("delete", async (ctx) => {
    const userId = ctx.from.id;
    const defaultToken = getUserDefaultToken(userId);

    if (!defaultToken) {
        return ctx.reply("You don't have a default token. Please create or restore one.");
    }

    const args = ctx.message.text.split(" ").slice(1);

    if (args.length < 1) {
        return ctx.reply("Please provide a key to delete.");
    }

    const key = args[0];
    const dataset = readDataset(defaultToken);

    if (!dataset) {
        return ctx.reply("Dataset not found for your token.");
    }

    const entry = Object.entries(dataset.data).find(([id, record]) => record.key === key);
    if (entry) {
        const [id] = entry;
        delete dataset.data[id];

        const newSpaceUsed = Buffer.byteLength(JSON.stringify(dataset.data), "utf8");
        writeDataset(defaultToken, dataset.data, newSpaceUsed);
        ctx.reply(`Data for key ${key} has been deleted.`);
    } else {
        ctx.reply("Key not found.");
    }
});

bot.command("list", async (ctx) => {
    const userId = ctx.from.id;
    const defaultToken = getUserDefaultToken(userId);

    if (!defaultToken) {
        return ctx.reply("You don't have a default token. Please create or restore one.");
    }

    const dataset = readDataset(defaultToken);

    if (!dataset) {
        return ctx.reply("Dataset not found for your token.");
    }

    const keysList = Object.entries(dataset.data).map(([id, record]) => {
        const size = Buffer.byteLength(JSON.stringify(record.value), "utf8");
        return `Key: ${record.key}, Size: ${size} bytes`;
    });

    if (keysList.length === 0) {
        ctx.reply("No data found for your token.");
    } else {
        ctx.reply(keysList.join("\n"));
    }
});

bot.command("help", (ctx) => {
    const helpMessage = `
    Available Commands:
    /create - Create a new token and dataset.
    /backup - Backup your old data to a new token.
    /restore [token] - Restore and set a token as default.
    /add --data {json} --key {name} - Add data to your dataset using a key and JSON data (reply to message).
    /get [key] - Get the data for a specific key.
    /edit --key [key] --data {json} - Edit data for a specific key.
    /clear - Clear all data in your dataset.
    /delete [key] - Delete data for a specific key.
    /list - List all keys in your dataset along with their size.
    /help - Show this help message.
    `;
    ctx.reply(helpMessage);
});

bot.start();
