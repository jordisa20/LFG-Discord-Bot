# Discord LFG Bot 🎮

## Overview

This Discord bot allows users to easily create **Looking For Group (LFG)** posts using interactive dropdown menus instead of typing commands manually. It is designed for a clean and simple user experience, making it easier for server members to find teammates for games like Valorant.

Users can create an LFG post by selecting:
- Group type (Duo, Trio, 5 Stack)
- Region
- Game mode
- Rank (only required for Competitive or Premier)

Once created, the bot posts an embedded message in a queue channel where others can **join, leave, or close** the group using buttons.

---

## Features

### Core Functionality

- [x] Slash command `/lfg` to start the process  
- [x] Dropdown menus (no manual typing required)  
- [x] Conditional rank selection (only for ranked modes)  
- [x] Clean embedded LFG posts  
- [x] Join / Leave / Close buttons  
- [x] Automatic player limit (Duo, Trio, 5 Stack)  
- [x] Automatically disables joining when full  
- [x] One active post per user (old one gets removed)  
- [x] Auto-deletes inactive posts after 2 hours  

---

## How It Works

1. User runs `/lfg`
2. Bot guides them through selections:
   - Type → Region → Mode → (Rank if needed)
3. Bot posts an LFG embed in the queue channel
4. Other users interact using buttons:
   - **Join** → adds them to the group  
   - **Leave** → removes them  
   - **Close** → only the host can delete the post  

---

## Tech Stack

- **Node.js**
- **discord.js (v14)**
- **dotenv**

---

## Installation & Setup

### 1. Clone the repo

```bash
git clone https://github.com/yourusername/discord-lfg-bot.git
cd discord-lfg-bot  
```

### 2. Install dependencies  
```bash
npm install  
```

### 3. Create .env file  
```bash
DISCORD_TOKEN=your_bot_token  
CLIENT_ID=your_application_id  
GUILD_ID=your_server_id  
QUEUE_CHANNEL_ID=your_queue_channel_id  
DUO_ROLE_ID=optional_duo_role_id  
TRIO_ROLE_ID=optional_trio_role_id  
STACK5_ROLE_ID=optional_5stack_role_id  
```

`DUO_ROLE_ID`, `TRIO_ROLE_ID`, and `STACK5_ROLE_ID` are optional but recommended. If provided, the bot will mention those exact roles instead of relying on role-name matching.

### 4. Run the bot  
```bash
node index.js  
```

## Deployment

To keep the bot running 24/7, you can deploy it using:

- Railway (recommended)  
- Render (background worker)  
- Fly.io  


## Notes / Challenges  
- Handling Discord permission errors (Missing Access)  
- Managing active LFG state per user  
- Building multi-step dropdown interaction flow  
- Preventing duplicate posts per user   

## Future Improvements  
- Role pings for Duo / Trio / 5 Stack  
- Region-based matchmaking filters  
- Voice channel auto-creation  
- Better embed styling  
- Queue matchmaking system  

## License  
This project is licensed under the MIT License.
