Here's the complete code to fetch ETH/USD price from Chainlink on Base:

---

### Using ethers.js (recommended)

```javascript
import { ethers } from "ethers";

const ABI = [
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
];

const FEEDS = {
  "ETH/USD": "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
  "BTC/USD": "0xCCADC697c55bbB68dc5bCdf8d3CBe83CdD4E071E",
  "LINK/USD": "0x17CAb8FE31E32f08326e5E27412894e49B0f9D65",
};

const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");

async function getPrice(pair = "ETH/USD") {
  const feed = new ethers.Contract(FEEDS[pair], ABI, provider);
  const { answer, updatedAt } = await feed.latestRoundData();

  const price = Number(answer) / 1e8; // Chainlink answers are 8 decimals
  const age = Math.floor(Date.now() / 1000 - Number(updatedAt));

  return { pair, price, age, updatedAt: new Date(Number(updatedAt) * 1000) };
}

// Single pair
const result = await getPrice("ETH/USD");
console.log(
  `ETH/USD: $${result.price.toFixed(2)} (updated ${result.age}s ago)`,
);
// → ETH/USD: $3201.45 (updated 12s ago)

// All pairs at once
async function getAllPrices() {
  const results = await Promise.all(Object.keys(FEEDS).map(getPrice));
  results.forEach((r) => console.log(`${r.pair}: $${r.price.toFixed(2)}`));
}
```

---

### Live polling (for your arena)

```javascript
async function startPriceFeed(pair = "ETH/USD", onPrice) {
  let lastPrice = null;

  async function poll() {
    try {
      const { price, age } = await getPrice(pair);

      // Chainlink updates every ~20s or when price moves >0.5%
      // Warn if data is stale (>3 min)
      if (age > 180) console.warn(`Stale price: ${age}s old`);

      if (price !== lastPrice) {
        onPrice({ price, age, change: lastPrice ? price - lastPrice : 0 });
        lastPrice = price;
      }
    } catch (err) {
      console.error("Feed error:", err.message);
    }
  }

  await poll(); // immediate first fetch
  return setInterval(poll, 5000); // poll every 5s
}

// Usage
const stop = await startPriceFeed("ETH/USD", ({ price, change }) => {
  console.log(`ETH: $${price.toFixed(2)} ${change >= 0 ? "▲" : "▼"}`);
});

// Later: clearInterval(stop) to stop polling
```

---

### Base Sepolia (testnet feeds)

```javascript
const TESTNET_FEEDS = {
  "ETH/USD": "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1",
  "BTC/USD": "0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298",
  "LINK/USD": "0xb113F5A928BCfF189C998ab20d753a47F9dE5A61",
};

// Same code — just swap in TESTNET_FEEDS and use:
const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
```

---

### Key things to know

| Detail              | Value                                            |
| ------------------- | ------------------------------------------------ |
| Decimals            | Always `1e8` (8 decimals) for USD pairs          |
| Heartbeat           | ~20s on Base (updates on deviation or heartbeat) |
| Deviation threshold | 0.5% price move triggers an update               |
| Free to call        | Read-only view function, no gas needed           |
| No API key          | Just needs an RPC endpoint                       |

For the arena, **Base Sepolia testnet feeds** are the right ones to use since you're already on that network — the price will be real market data even on testnet, since Chainlink pushes the same oracle data regardless of network.
