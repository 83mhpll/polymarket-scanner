import re

# 1. Fix XSS in index.html
with open('public/index.html', 'r') as f:
    content = f.read()

escape_func = """function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag]));
}

let allData = null;"""

content = content.replace("let allData = null;", escape_func)

# Fix createCardHTML
content = content.replace("function createCardHTML(o, i, isAlert = false) {", """function createCardHTML(o, i, isAlert = false) {
  const safeQuestion = escapeHTML(o.question);
  const safeOutcome = escapeHTML(o.outcome);""")

content = content.replace("${o.question}", "${safeQuestion}")
content = content.replace('title="${safeQuestion}"', 'title="${escapeHTML(o.question)}"') # fix replacement issue
content = content.replace("${o.outcome}", "${safeOutcome}")

# Fix renderQuantTab (1c dust)
content = content.replace("${item.question}", "${escapeHTML(item.question)}")
content = content.replace("${item.outcome}", "${escapeHTML(item.outcome)}")
content = content.replace("${item.title}", "${escapeHTML(item.title)}")
content = content.replace("${item.parentQuestion}", "${escapeHTML(item.parentQuestion)}")
content = content.replace("${item.childQuestion}", "${escapeHTML(item.childQuestion)}")

with open('public/index.html', 'w') as f:
    f.write(content)

# 2. Fix trader.js
with open('trader.js', 'r') as f:
    trader_content = f.read()

trader_content = trader_content.replace("""  const wallet = new ethers.Wallet(
    "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );""", """  if (!config.apiCredentials.privateKey) {
    throw new Error("Private Key missing. Please add it in the Config UI.");
  }
  const wallet = new ethers.Wallet(config.apiCredentials.privateKey);""")

with open('trader.js', 'w') as f:
    f.write(trader_content)

# 3. Fix server.js fetch timeout
with open('server.js', 'r') as f:
    server_content = f.read()

timeout_fetch = """          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 10000);
          const r = await fetch(
            `https://gamma-api.polymarket.com/events?slug=${trade.slug}`,
            { signal: ctrl.signal }
          );
          clearTimeout(tid);"""

server_content = server_content.replace("""          const r = await fetch(
            `https://gamma-api.polymarket.com/events?slug=${trade.slug}`,
          );""", timeout_fetch)

with open('server.js', 'w') as f:
    f.write(server_content)
