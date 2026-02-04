# Uno Online - Peer-to-Peer Multiplayer

A real-time multiplayer Uno card game that works over the internet using PeerJS (WebRTC). 

**No backend server is required!** The game logic runs entirely in the browser, and players connect directly to each other.

## 🚀 Features
- **Global Multiplayer**: Play with friends anywhere in the world.
- **Instant Join**: Share a link or QR code to let friends join instantly.
- **Real-time Chat**: Chat with opponents during the game.
- **High Quality Graphics**: Smooth animations and 3D card effects.
- **Mobile Friendly**: Works great on phones and tablets.

## 🌐 How to Deploy (Online)

Since this game uses PeerJS for P2P connections, you can host it on any static site provider.

### Option 1: Netlify / Vercel (Recommended)
1.  Run `npm run build`.
2.  Upload the `dist` folder to Netlify Drop or Vercel.
3.  Share your new website link with friends!

### Option 2: GitHub Pages
1.  Push this code to a GitHub repository.
2.  Enable GitHub Pages for the repository.

## 🛠 Local Development

1.  **Install**:
    ```bash
    npm install
    ```

2.  **Run**:
    ```bash
    npm run dev
    ```

3.  **Build**:
    ```bash
    npm run build
    ```

## 🎮 How to Play
1.  **Host**: Click "Create Game".
2.  **Share**: Copy the Room Link or show the QR Code to your friends.
3.  **Join**: Friends open the link to join automatically.
4.  **Start**: Once everyone is in the lobby, the host starts the game.
