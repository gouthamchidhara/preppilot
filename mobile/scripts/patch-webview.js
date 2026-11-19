// iOS 26 adds a "scroll edge effect" (a frosted band with a hairline) under the status bar of every
// scroll view, which made PrepPilot's top look stuck below the Dynamic Island. Hide it on the
// WebView's scroll view. Runs after npm install (locally and on EAS). Safe on older iOS: the
// property is looked up at runtime and skipped if missing.
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'node_modules', 'react-native-webview', 'apple', 'RNCWebViewImpl.m');
if (!fs.existsSync(file)) process.exit(0);
let src = fs.readFileSync(file, 'utf8');
const mark = '/* preppilot: hide iOS 26 top edge effect */';
if (src.includes(mark)) process.exit(0);
const anchor = '    _webView.scrollView.delegate = self;';
if (!src.includes(anchor)) { console.warn('patch-webview: anchor not found, skipped'); process.exit(0); }
src = src.replace(anchor, `${anchor}
    ${mark}
    for (NSString *edge in @[@"topEdgeEffect", @"bottomEdgeEffect"]) {
      if ([_webView.scrollView respondsToSelector:NSSelectorFromString(edge)]) {
        id effect = [_webView.scrollView valueForKey:edge];
        if ([effect respondsToSelector:NSSelectorFromString(@"setHidden:")]) [effect setValue:@YES forKey:@"hidden"];
      }
    }`);
fs.writeFileSync(file, src);
console.log('patch-webview: iOS edge effects hidden');
