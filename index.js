const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const fs = require('fs');
const cron = require('node-cron');

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const TARGET_CHANNEL = '@VipYonoFreeCode';

const POSTS_FILE = 'posts.json';
const USERS_FILE = 'users.json';

// ==========================================
// 🛡️ ডাটাবেজ সেফটি লজিক (অপরিবর্তিত ও সুরক্ষিত)
// ==========================================
let postDatabase = {};
if (fs.existsSync(POSTS_FILE)) {
    try {
        postDatabase = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
    } catch (e) {
        postDatabase = {};
    }
}

function savePosts() {
    fs.writeFileSync(POSTS_FILE, JSON.stringify(postDatabase, null, 2));
}

let botUsers = [];
if (fs.existsSync(USERS_FILE)) {
    try {
        botUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch (e) {
        botUsers = [];
    }
}

function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(botUsers, null, 2));
}

// ==========================================
// 🧹 স্ক্রিন ক্লিনআপ ট্র্যাকার (ভিডিওর মতো করার জন্য)
// ==========================================
let lastBotMessages = {}; // প্রতি ইউজারের আগের মেসেজ ট্র্যাক করার জন্য

function trackBotMessage(chatId, messageId) {
    if (!lastBotMessages[chatId]) {
        lastBotMessages[chatId] = [];
    }
    lastBotMessages[chatId].push(messageId);
}

async function deletePreviousBotMessages(chatId) {
    if (lastBotMessages[chatId] && lastBotMessages[chatId].length > 0) {
        for (let msgId of lastBotMessages[chatId]) {
            try {
                await bot.deleteMessage(chatId, msgId);
            } catch (e) {
                // মেসেজ আগে থেকে ডিলিট থাকলে বা পুরোনো হলে স্কিপ করবে
            }
        }
        lastBotMessages[chatId] = [];
    }
}

// Web Server Setup
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running successfully!\n');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

// স্মার্ট ফরম্যাটিং ফাংশন (অপরিবর্তিত)
function smartFormatPost(text, entities) {
    if (!text) return '';

    if (text.includes('All Yono Apps') && !text.toLowerCase().includes('code')) {
        return text; 
    }

    let downloadUrl = '';
    if (entities && entities.length > 0) {
        entities.forEach(entity => {
            if (entity.type === 'text_link' && entity.url) {
                if (!entity.url.includes('t.me') && !entity.url.includes('telegram')) {
                    downloadUrl = entity.url;
                }
            } else if (entity.type === 'url') {
                let extractedUrl = text.substring(entity.offset, entity.offset + entity.length);
                if (extractedUrl && !extractedUrl.includes('t.me') && !extractedUrl.includes('telegram')) {
                    downloadUrl = extractedUrl;
                }
            }
        });
    }

    if (!downloadUrl) {
        let urlMatch = text.match(/(https?:\/\/[^\s<]+)/g);
        if (urlMatch) {
            for (let u of urlMatch) {
                if (!u.includes('t.me') && !u.includes('telegram')) {
                    downloadUrl = u;
                    break;
                }
            }
        }
    }

    let lines = text.split('\n');
    let formattedLines = [];
    let hashtags = [];
    let nonEmtpyCount = 0;

    lines.forEach(line => {
        let trimmed = line.trim();
        if (!trimmed) return;
        let lower = trimmed.toLowerCase();

        if (trimmed.startsWith('#')) {
            let tags = trimmed.match(/#\w+/g);
            if (tags) {
                tags.forEach(t => {
                    if (!hashtags.includes(t)) hashtags.push(t);
                });
            }
            return;
        }

        nonEmtpyCount++;

        if (nonEmtpyCount === 1) {
            let cleanLine = trimmed.replace(/<[^>]*>/g, '');
            formattedLines.push(`<b>${cleanLine}</b>`);
            return;
        }

        if (lower.includes('code') && !lower.startsWith('http') && !lower.includes('app link') && !lower.includes('join this channel') && !lower.includes('never miss')) {
            let parts = trimmed.split(/➔|->|➜|:/);
            if (parts.length > 1) {
                let label = parts[0].trim();
                let rawCode = parts.slice(1).join(':').replace(/<[^>]*>/g, '').replace(/`/g, '').trim();
                let safeCode = rawCode.replace(/\./g, '.\u200B');
                formattedLines.push(`<b>${label}</b>: <code>${safeCode}</code>`);
            } else {
                let safeTrimmed = trimmed.replace(/\./g, '.\u200B');
                formattedLines.push(`<code>${safeTrimmed}</code>`);
            }
        } 
        else if (lower.includes('download now') || lower.includes('game link') || lower.includes('link')) {
            if (downloadUrl) {
                if (lower.includes('download now')) {
                    let replacedLine = trimmed.replace(/download now/gi, `<a href="${downloadUrl}"><b>Download Now</b></a>`);
                    formattedLines.push(replacedLine);
                } else {
                    formattedLines.push(`<b>🎰 GAME LINK </b> ➜ <a href="${downloadUrl}"><b>Download Now</b></a>📱`);
                }
            } else {
                formattedLines.push(trimmed);
            }
        } 
        else if (lower.includes('minimum') || lower.includes('withdrawal')) {
            let cleanLine = trimmed.replace(/<[^>]*>/g, '');
            formattedLines.push(`<b>${cleanLine}</b>`);
        } 
        else if (
            lower.includes('signup bonus') || 
            lower.includes('new users') || 
            lower.includes('join this channel') || 
            lower.includes('pin this channel') ||
            lower.includes('never miss') ||
            lower.includes('important promo code') ||
            trimmed.startsWith('🔥') ||
            trimmed.startsWith('🎁')
        ) {
            let cleanLine = trimmed.replace(/<[^>]*>/g, '');
            formattedLines.push(`<blockquote>${cleanLine}</blockquote>`);
        } 
        else {
            formattedLines.push(trimmed);
        }
    });

    if (hashtags.length > 0) {
        formattedLines.push(`<blockquote><tg-spoiler>${hashtags.join(' ')}</tg-spoiler></blockquote>`);
    }

    return formattedLines.join('\n\n');
}

// অটোমেটিক ব্রডকাস্ট ফাংশন (অপরিবর্তিত)
function broadcastPostToAllUsers(post) {
    if (!botUsers || botUsers.length === 0) return;

    console.log(`Broadcasting new post to ${botUsers.length} users...`);

    const options = { 
        parse_mode: "HTML",
        disable_web_page_preview: true 
    };
    if (post.replyMarkup) {
        options.reply_markup = post.replyMarkup;
    }

    botUsers.forEach((userId, index) => {
        setTimeout(() => {
            if (post.photo) {
                bot.sendPhoto(userId, post.photo, { caption: post.text, ...options }).catch(err => {
                    console.error(`Failed to send to ${userId}:`, err.message);
                });
            } else if (post.text) {
                bot.sendMessage(userId, post.text, options).catch(err => {
                    console.error(`Failed to send to ${userId}:`, err.message);
                });
            }
        }, index * 40); 
    });
}

function savePostContent(msg) {
    let rawText = msg.caption || msg.text || '';
    let entities = msg.caption_entities || msg.entities || [];
    
    let text = smartFormatPost(rawText, entities);
    if (!text) text = rawText;
    
    const photo = msg.photo ? msg.photo[msg.photo.length - 1].file_id : null;
    const replyMarkup = msg.reply_markup || null;
    
    let postContent = null;

    if (text || photo) {
        postContent = {
            text: text,
            photo: photo,
            replyMarkup: replyMarkup || null,
            timestamp: Date.now()
        };

        if (!postDatabase['all_posts']) {
            postDatabase['all_posts'] = [];
        }
        const globalExists = postDatabase['all_posts'].some(p => p.text === text);
        if (!globalExists) {
            postDatabase['all_posts'].push(postContent);
            savePosts();
        }
    }

    return postContent;
}

bot.on('channel_post', (msg) => {
    const chatUsername = msg.chat.username ? `@${msg.chat.username.toLowerCase()}` : '';
    if (chatUsername === TARGET_CHANNEL.toLowerCase()) {
        const newPost = savePostContent(msg);
        if (newPost) {
            broadcastPostToAllUsers(newPost);
        }
    }
});

function restorePostsToChannel(chatId) {
    if (postDatabase['all_posts'] && postDatabase['all_posts'].length > 0) {
        bot.sendMessage(chatId, `Restoring ${postDatabase['all_posts'].length} posts safely with intact links...`);
        
        postDatabase['all_posts'].forEach((post, index) => {
            setTimeout(() => {
                const options = { 
                    parse_mode: "HTML",
                    disable_web_page_preview: true 
                };
                if (post.replyMarkup) {
                    options.reply_markup = post.replyMarkup;
                }

                if (post.photo) {
                    bot.sendPhoto(TARGET_CHANNEL, post.photo, { 
                        caption: post.text, 
                        ...options 
                    }).catch(err => {
                        bot.sendPhoto(TARGET_CHANNEL, post.photo, { caption: post.text, reply_markup: post.replyMarkup }).catch(e => {});
                    });
                } else if (post.text) {
                    bot.sendMessage(TARGET_CHANNEL, post.text, options).catch(err => {
                        bot.sendMessage(TARGET_CHANNEL, post.text, { reply_markup: post.replyMarkup }).catch(e => {});
                    });
                }
            }, index * 1200);
        });
    } else {
        bot.sendMessage(chatId, "No saved posts found in database to restore!");
    }
}

// সার্চ ফিল্টার (অপরিবর্তিত)
function getRecentPostsForQuery(userQuery) {
    if (!postDatabase['all_posts'] || postDatabase['all_posts'].length === 0) {
        return [];
    }

    const cleanQuery = userQuery.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanQuery.length < 2) return [];

    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);

    let matched = postDatabase['all_posts'].filter(post => {
        if (!post.text) return false;
        let cleanText = post.text.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanText.includes(cleanQuery);
    });

    if (matched.length === 0) return [];

    matched.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    let recent24h = matched.filter(p => p.timestamp && p.timestamp >= twentyFourHoursAgo);

    if (recent24h.length > 0) {
        return recent24h.slice(0, 2); 
    } else {
        let latest = matched[0];
        if (!latest.timestamp) {
            return [latest];
        }
        return []; 
    }
}

// ==========================================
// 🚀 আপডেট করা মেসেজ লজিক (অটো-ডিলিট সহ)
// ==========================================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!botUsers.includes(chatId)) {
        botUsers.push(chatId);
        saveUsers();
    }

    // ১. ইউজারের পাঠানো টেক্সট মেসেজটি সঙ্গে সঙ্গে ডিলিট করা
    try {
        await bot.deleteMessage(chatId, msg.message_id);
    } catch (e) {}

    if (text) {
        // ২. বটের পাঠানো পুরোনো মেসেজগুলো স্ক্রিন থেকে ডিলিট করা
        await deletePreviousBotMessages(chatId);

        if (text.startsWith('/start')) {
            const welcomeText = `<b>Welcome to the Official Promo Code Bot!</b>\n\n<b>⚠️ Notice:</b> Here you will get Only Yono Promo Code. No other games or unrelated content will be provided here.\n\n🚀 All updates and promo codes for any new Yono games will be available here first!\n\n📢 <b>How to get codes instantly:</b>\n• Whenever you join, you will automatically receive new posts.\n• Need codes right now? Just type and search the game name in the chat. The bot will instantly send you the available promo codes right away!`;
            
            let sentMsg = await bot.sendMessage(chatId, welcomeText, { parse_mode: "HTML" });
            if (sentMsg) trackBotMessage(chatId, sentMsg.message_id);

        } else if (text.startsWith('/restore')) {
            restorePostsToChannel(chatId);
        } else {
            let foundPosts = getRecentPostsForQuery(text);

            if (foundPosts.length > 0) {
                for (let post of foundPosts) {
                    await sendPostToUser(chatId, post);
                }
            } else {
                const notFoundMessage = `🔥 <b>EXCLUSIVE CODE IS GENERATING...</b> 🔥\n\n` +
                    `⚡ The VIP promo code for <b>"${text.trim()}"</b> is currently being refreshed and will drop very soon!\n\n` +
                    `💡 <b>DON'T JUST WAIT! DO THIS RIGHT NOW:</b>\n` +
                    `• 🎮 Don't wait for just this one game! Search for <b>ANY OTHER YONO GAME</b> in the chat right now!\n` +
                    `• 💰 Hundreds of live promo codes for other Yono games are active & ready to claim!\n` +
                    `• 🔔 Keep notifications <b>ON</b> so you don't miss the fast drop.\n` +
                    `• ⏳ Search for <b>"${text.trim()}"</b> again in <b>2 to 5 minutes</b> to grab it first!\n\n` +
                    `👑 <i>This is your #1 Official Hub for <b>ALL YONO GAMES & ALL VIP CODES!</b> 🚀</i>`;

                let sentMsg = await bot.sendMessage(chatId, notFoundMessage, { parse_mode: "HTML" });
                if (sentMsg) trackBotMessage(chatId, sentMsg.message_id);
            }
        }
    }
});

async function sendPostToUser(userId, post) {
    const options = { 
        parse_mode: "HTML",
        disable_web_page_preview: true 
    };
    if (post.replyMarkup) {
        options.reply_markup = post.replyMarkup;
    }

    try {
        let sentMsg;
        if (post.photo) {
            sentMsg = await bot.sendPhoto(userId, post.photo, { caption: post.text, ...options });
        } else if (post.text) {
            sentMsg = await bot.sendMessage(userId, post.text, options);
        }

        if (sentMsg) {
            trackBotMessage(userId, sentMsg.message_id);
        }
    } catch (err) {
        console.error(`Failed to send post to ${userId}:`, err.message);
    }
}

// ==========================================
// 🔄 প্রতি ৭ দিনে স্বয়ংক্রিয় অটো-মেসেজ (অপরিবর্তিত)
// ==========================================
const weeklyMessage = `⚡ <b>WEEKLY VIP BONUS ALERT!</b> ⚡\n\n` +
    `🎁 <b>New Yono Promo Codes Are Now Live!</b>\n\n` +
    `Hey Gamer! Hundreds of fresh & active promo codes for <b>ALL YONO GAMES</b> have just been updated! Don't let your free bonuses expire! 💰\n\n` +
    `🔥 <b>WHAT TO DO RIGHT NOW:</b>\n` +
    `• 🎮 Type & search <b>ANY Yono Game Name</b> in this chat right now!\n` +
    `• 💎 Claim your daily signup & deposit promo codes instantly!\n` +
    `• 🔔 Keep your notifications <b>ON</b> so you never miss a fast-claim code drop!\n\n` +
    `👑 <i>Type your favorite game name below and grab your free code now! 🚀</i>`;

cron.schedule('0 10 * * 0', () => {
    console.log('Sending weekly promo code message to all users...');
    if (botUsers && botUsers.length > 0) {
        botUsers.forEach((userId, index) => {
            setTimeout(() => {
                bot.sendMessage(userId, weeklyMessage, { parse_mode: 'HTML', disable_web_page_preview: true })
                    .catch(err => console.log(`User ${userId} blocked the bot or failed.`));
            }, index * 40); 
        });
    }
});

console.log("Bot running with clean screen UI, strict search, 24h filter & safe data storage...");
