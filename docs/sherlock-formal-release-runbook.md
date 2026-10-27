# Sherlock 正式版升级发布手册

## 触发与默认行为

只有用户明确说“更新上传发布正式版”“发布 Sherlock 正式版”“发布大版本”，或明确要求对外发布、让现有用户升级时，才授权执行本手册全部步骤。用户只要求“本地启动看看”“构建给我测试”“测试一下最新版本”时，必须改走 `docs/sherlock-local-test-runbook.md`，不得触发 Apple 公证、Cloudflare 上传或公开更新源变更。

正式发布若未指定版本，比较 `package.json` 与公开 `latest-mac.yml` 后，将较高正式版本的补丁号加一。Cloudflare 是正式更新主通道；GitHub Fork 是源码备份通道，不以当前上游 PR 是否可合并作为发布阻塞条件。

## 不可破坏的发布约束

1. 新版本必须高于线上版本，禁止覆盖已发布版本目录。
2. macOS 必须同时生成两条通道：`legacy-bridge` ZIP 供已安装 0.6.3 的用户升级，Apple 公证的 DMG/ZIP 供新安装和后续正式更新。禁止用 Developer ID 直接覆盖旧更新源，否则 0.6.3 会拒绝签名变化。
3. 兼容桥外层签名必须使用 `Sherlock Desktop Update Signing`，指纹 `8B8FCCFB659D94D5C9A9CE2B735EB0FAE457CC7B`；其外层 Info.plist 与指定要求都必须为 `io.dsh.desktop`，内嵌的已公证正式 App 才是 `com.evanarts.sherlock`。
4. 公证通道必须使用 `Developer ID Application: yafeng he (FAV8TLDK73)`，指纹 `DDFBC7F4DA5EC49721E454BB06329C6D1E8A7B9F`，并通过 Apple notarization、stapling 和 Gatekeeper 检查。
5. 旧自签名身份备份位于 `/Users/heyafeng/Documents/Sherlock Release Backup/Sherlock-Desktop-Update-Signing-8B8FCCFB.p12`；密码存于 macOS 钥匙串，service 为 `Sherlock Update Signing P12 Backup Password`，account 为 `Sherlock Release Backup`。
6. 先上传不可变版本资源，再更新公证 DMG 稳定下载别名，最后分别提升 `latest/latest-mac.yml` 与 `notarized/latest/latest-mac.yml`。发布脚本已按此顺序执行。
7. 不丢弃、覆盖或顺手提交用户的无关改动；禁止 `git add -A`、强推和直接推送上游 `origin/main`。正式构建必须从干净的本地 `main` 提交执行，且不得遗漏其他本地分支中准备发布的提交。
8. 当前正式渠道是 macOS Apple Silicon。没有同时构建 Intel/Windows 时，不宣称这两个平台已发布。
9. 两个 generic 更新通道及手工嵌入的 `app-update.yml` 必须设置 `useMultipleRangeRequest: false`，以单段 Range 传输差分数据，避免 CDN 多段响应格式差异导致全量回退。保留 updater 的旧包缓存和 SHA-512 校验；没有缓存、旧 blockmap 不可用或差分校验失败时，仍由更新器安全回退全量下载。此客户端配置只对安装了该配置的新客户端生效，不能追溯修改已发布客户端。
10. 已安装 0.6.3 的用户长期走旧证书兼容 feed；新下载用户走 Developer ID 公证 feed。每次发布都必须维护两套签名 ZIP，除非未来另行实现并真实验证签名迁移安装器。
11. R2 采用滚动版本保留：新版本全部公开验证成功后，只删除 `releases/v*` 中版本号最早的一个目录。禁止删除 `latest/`、`notarized/latest/`、`download/`、当前版本或一次删除多个旧版本；发布或公开验证失败时禁止清理旧版本。

对外稳定下载地址为 `https://updates.evanarts.com/download/EWork-Odyssey-mac-arm64.dmg`，下载文件名为 `EWork-Odyssey-mac-arm64.dmg`。下载 Worker 将此地址直接映射到现有 R2 对象 `download/sherlock-mac-arm64.dmg`，保留旧 URL 兼容；两个地址都跟随同一对象更新，不需要双份上传。发布与回滚脚本继续操作原 R2 key，版本资源和自动更新元数据命名不变。每次发布需检查新地址的 HEAD、Range/206、文件名及 no-store 缓存策略。

## 升级验证范围（用户要求，2026-09-07）

发布只做差分更新校验，不再执行旧客户端全量下载、安装替换、重启升级测试。此规则替代旧版手册的全量升级验收门禁。保留签名、包完整性、公开更新源、Range、缓存和合成文件 SHA-512 检查；差分不可用时明确报告，不改跑全量升级测试。

## 1. 发布前检查

在 `/Users/heyafeng/Documents/ChatGPT/dsh` 中：

```bash
git status --short --branch
git diff --check
npm run git:formal:verify
security find-identity -v -p codesigning
xcrun notarytool history \
  --key /Users/heyafeng/Downloads/AuthKey_KSJ7725349.p8 \
  --key-id KSJ7725349 \
  --issuer 840d0b5c-4924-4f62-8a86-6201e832a4d6
curl -fsS https://updates.evanarts.com/latest/latest-mac.yml
curl -fsS https://updates.evanarts.com/notarized/latest/latest-mac.yml
```

- 记录工作区已有改动并区分当前开发成果与无关文件；打包使用用户确认的当前开发成果，但只提交发布相关文件。
- 确认两张钥匙串身份名称和指纹均匹配，并验证 App Store Connect API key 可访问公证历史。旧兼容身份缺失时先从加密 P12 恢复，不能生成新证书代替。恢复密码必须捕获到进程变量，禁止输出到日志：

```bash
sherlock_signing_keychain="$(security default-keychain -d user | tr -d '\"')"
sherlock_p12_password="$(security find-generic-password \
  -a 'Sherlock Release Backup' \
  -s 'Sherlock Update Signing P12 Backup Password' \
  -w)"
security import \
  '/Users/heyafeng/Documents/Sherlock Release Backup/Sherlock-Desktop-Update-Signing-8B8FCCFB.p12' \
  -k "$sherlock_signing_keychain" \
  -P "$sherlock_p12_password" \
  -T /usr/bin/codesign \
  -T /usr/bin/productbuild
unset sherlock_p12_password
```

若导入后身份仍未被识别为有效代码签名身份，停止发布并修复证书信任；不能切换到另一张证书。

- 保存线上旧元数据、稳定 DMG 别名和已验证的旧版 ZIP/blockmap，以便差分校验及异常回滚。必须在正式打包覆盖 `dist` 前执行：

```bash
sherlock_release_tmp="$(mktemp -d /tmp/sherlock-formal-release.XXXXXX)"
./node_modules/.bin/wrangler r2 object get \
  sherlock-releases/latest/latest-mac.yml \
  --remote \
  --file "$sherlock_release_tmp/previous-legacy-latest-mac.yml"
./node_modules/.bin/wrangler r2 object get \
  sherlock-releases/notarized/latest/latest-mac.yml \
  --remote \
  --file "$sherlock_release_tmp/previous-notarized-latest-mac.yml" || true
./node_modules/.bin/wrangler r2 object get \
  sherlock-releases/download/sherlock-mac-arm64.dmg \
  --remote \
  --file "$sherlock_release_tmp/previous-sherlock-mac-arm64.dmg"
# 保留上一版已验证 ZIP 和 blockmap 作为差分基线，无需准备旧客户端运行夹具。
```

## 2. 版本与聚焦验证

以下以 `0.6.4` 为例，实际使用计算出的版本：

```bash
npm version 0.6.4 --no-git-tag-version

npm test -- \
  test/app-identity.test.ts \
  test/update.test.ts \
  test/update-manager.test.ts \
  test/sidebar-update-control.test.ts \
  test/cloudflare-release.test.ts \
  test/release.test.ts \
  test/macos-self-signed-update.test.ts \
  test/macos-package-runtime.test.ts \
  test/brand-migration.test.ts

npm run typecheck
npm run build
```

聚焦验证通过后，先只暂存本次正式版本相关文件并创建中文本地提交，例如：

```bash
git commit -m "发布：准备 Sherlock 0.6.4 正式版"
```

若版本是 `1.0.0`、`2.0.0` 等大版本，还必须在该提交上创建本地注释标签：

```bash
git tag -a V1.0.0 -m "Sherlock V1.0.0"
```

再次执行 `npm run git:formal:verify`，确认当前是干净的 `main`，其他 worktree 没有未提交修改，也没有其他本地分支包含尚未合并的提交。未经用户明确授权，不得把版本标签推送到远端。

增加本次源码改动直接涉及的测试，但不运行全功能测试。任何失败都应先定位修复并重跑相关检查，不能带失败继续发布。

## 3. 正式打包与签名验证

```bash
./script/build_and_run.sh --formal

bridge_check="$(mktemp -d /tmp/sherlock-bridge-check.XXXXXX)"
ditto -x -k dist-legacy/sherlock-mac-arm64-legacy.zip "$bridge_check"
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' \
  "$bridge_check/Sherlock.app/Contents/Info.plist"
codesign --verify --deep --strict --verbose=2 "$bridge_check/Sherlock.app"
codesign --verify --strict \
  -R='identifier "io.dsh.desktop" and certificate root = H"8b8fccfb659d94d5c9a9ce2b735eb0fae457cc7b"' \
  "$bridge_check/Sherlock.app"
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' \
  "$bridge_check/Sherlock.app/Contents/Resources/Sherlock.app/Contents/Info.plist"
xcrun stapler validate \
  "$bridge_check/Sherlock.app/Contents/Resources/Sherlock.app"
test -x \
  "$bridge_check/Sherlock.app/Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt"
test -d "$bridge_check/Sherlock.app/Contents/Frameworks/Mantle.framework"
test -d "$bridge_check/Sherlock.app/Contents/Frameworks/ReactiveObjC.framework"

/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' \
  dist-notarized/mac-arm64/Sherlock.app/Contents/Info.plist
codesign --verify --deep --strict --verbose=2 dist-notarized/mac-arm64/Sherlock.app
xcrun stapler validate dist-notarized/mac-arm64/Sherlock.app
xcrun stapler validate dist-notarized/sherlock-mac-arm64.dmg
spctl --assess --type execute --verbose=2 dist-notarized/mac-arm64/Sherlock.app
spctl --assess --type open --context context:primary-signature --verbose=2 \
  dist-notarized/sherlock-mac-arm64.dmg
hdiutil verify dist-notarized/sherlock-mac-arm64.dmg
```

必须确认：兼容桥外层 Info.plist 是 `io.dsh.desktop` 并满足 0.6.3 的旧指定要求，内嵌 App 与公证 App 的 Info.plist 是 `com.evanarts.sherlock`；兼容桥含可执行 ShipIt 及 Squirrel/Mantle/ReactiveObjC；公证 App/DMG 均通过 Apple 验证；`dist-release` 同时包含旧桥 ZIP、公证 ZIP/DMG、两个 `latest-mac.yml`。`--formal` 只能用临时 `--sherlock-user-data-dir` 打开公证版，不能提前迁移用户真实数据。

## 4. Cloudflare 预演与正式提升

先预演，不写远端：

```bash
node scripts/publish-cloudflare-release.mjs \
  --bucket sherlock-releases \
  --version 0.6.4 \
  --tag v0.6.4 \
  --assets dist-release \
  --prepared "$sherlock_release_tmp/prepared" \
  --dry-run > "$sherlock_release_tmp/cloudflare-upload-plan.json"
cat "$sherlock_release_tmp/cloudflare-upload-plan.json"
```

确认计划中 `immutable` 在前、`stable` 居中、`metadata` 最后，再去掉 `--dry-run` 正式发布。不要手工提前上传 `latest-mac.yml`。

正式上传前，对预演列出的每个 `releases/v<version>/...` 不可变 key 执行一次远端存在性检查。目标 key 不存在才允许继续；若已存在，禁止覆盖，也禁止复用该版本号。

## 5. 公开更新源验证

```bash
curl -fsS https://updates.evanarts.com/latest/latest-mac.yml \
  | grep -F 'version: 0.6.4'
curl -fsS https://updates.evanarts.com/notarized/latest/latest-mac.yml \
  | grep -F 'version: 0.6.4'
curl -fsSI https://updates.evanarts.com/latest/latest-mac.yml \
  | grep -Eiq '^cache-control:.*no-cache'
curl -fsS --range 0-0 -o /dev/null \
  https://updates.evanarts.com/releases/v0.6.4/sherlock-mac-arm64-legacy.zip
curl -fsS --range 0-0 -o /dev/null \
  https://updates.evanarts.com/releases/v0.6.4/sherlock-mac-arm64.zip
curl -fsSI \
  https://updates.evanarts.com/releases/v0.6.4/sherlock-mac-arm64.zip \
  | grep -Eiq '^cache-control:.*immutable'
```

先独立验证默认目录迁移恢复逻辑；目标目录可预先存在但不能覆盖其中的新值：

```bash
migration_root="$sherlock_release_tmp/migration-app-data"
mkdir -p "$migration_root/dsh-desktop/harness" \
  "$migration_root/sherlock-desktop/harness"
printf 'legacy-sentinel' > \
  "$migration_root/dsh-desktop/harness/legacy-sentinel.txt"
printf 'new-settings' > \
  "$migration_root/sherlock-desktop/harness/settings.yaml"
open -na dist-legacy/mac-arm64/Sherlock.app --args \
  "--sherlock-app-data-dir=$migration_root"
# 启动完成后确认 legacy-sentinel 已复制、new-settings 未被覆盖、迁移 marker 已生成。
```

使用上一版已验证 ZIP 与本次构建的新 ZIP 进行真实公开差分校验（示例为 0.8.4 → 0.8.5）：

```bash
node scripts/verify-release-differential.mjs \
  --from 0.8.4 --to 0.8.5 \
  --old-file /path/to/verified-0.8.4.zip \
  --new-file dist-release/sherlock-mac-arm64.zip \
  --output "$sherlock_release_tmp/differential-0.8.5.zip"
```

脚本从公开版本目录获取新旧 blockmap，调用实际 electron-updater 差分下载器，只允许单段 Range/206；复用旧包数据后验证合成 ZIP 与签名构建产物的 SHA-512 完全一致。报告实际传输量、复用量及请求数。若无可复用数据或校验失败，停止并报告，不发起全量回退。兼容通道可额外指定 `--channel legacy`，使用对应旧桥 ZIP 和新桥 ZIP；不再运行旧客户端全量升级。

DSH 共存必须使用两个不同哨兵：DSH Desktop 保持 `dsh-desktop`，Sherlock 保持 `sherlock-desktop`，两个进程同时存在且互不改写对方哨兵。

从公开稳定地址重新下载 DMG 后执行固定 Gatekeeper 验证：

```bash
public_dmg="$sherlock_release_tmp/public-sherlock-0.6.4.dmg"
curl -fL https://updates.evanarts.com/download/EWork-Odyssey-mac-arm64.dmg \
  -o "$public_dmg"
xattr -w com.apple.quarantine '0081;00000000;Safari;' "$public_dmg"
xcrun stapler validate "$public_dmg"
spctl --assess --type open --context context:primary-signature --verbose=2 "$public_dmg"
mount_output="$(hdiutil attach -nobrowse "$public_dmg")"
mount_point="$(printf '%s\n' "$mount_output" | awk '/\/Volumes\// { sub(/^.*\/Volumes\//, "/Volumes/"); print; exit }')"
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' \
  "$mount_point/Sherlock.app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' \
  "$mount_point/Sherlock.app/Contents/Info.plist" | grep -Fx '0.6.4'
xcrun stapler validate "$mount_point/Sherlock.app"
spctl --assess --type execute --verbose=2 "$mount_point/Sherlock.app"
open -na "$mount_point/Sherlock.app" --args \
  "--sherlock-user-data-dir=$sherlock_release_tmp/public-smoke-user-data"
# 等到真实窗口可用且进程稳定后，再执行 detach。
hdiutil detach "$mount_point"
```

每次发布均不执行全量升级验证，也不把差分合成成功表述为已经完成真实客户端安装重启。差分或公开资源校验失败应调查原因；本版本资源损坏或元数据错误时回滚公开入口。

若发布命令在写入稳定 DMG 后的任何阶段报错、提升后的公开元数据异常，或本版本资源损坏，立即恢复旧元数据和稳定 DMG 下载别名，再验证公开入口已回到旧版本；不可变版本资源可以保留：

```bash
./node_modules/.bin/wrangler r2 object put \
  sherlock-releases/latest/latest-mac.yml \
  --remote \
  --file "$sherlock_release_tmp/previous-legacy-latest-mac.yml" \
  --content-type application/yaml \
  --cache-control 'no-cache, max-age=0, must-revalidate'
./node_modules/.bin/wrangler r2 object put \
  sherlock-releases/notarized/latest/latest-mac.yml \
  --remote \
  --file "$sherlock_release_tmp/previous-notarized-latest-mac.yml" \
  --content-type application/yaml \
  --cache-control 'no-cache, max-age=0, must-revalidate'
./node_modules/.bin/wrangler r2 object put \
  sherlock-releases/download/sherlock-mac-arm64.dmg \
  --remote \
  --file "$sherlock_release_tmp/previous-sherlock-mac-arm64.dmg" \
  --content-type application/x-apple-diskimage \
  --cache-control 'no-cache, max-age=0, must-revalidate'
```

若发布前 `notarized/latest/latest-mac.yml` 为 404，则不要执行上面的 notarized 元数据恢复命令；应精确删除本次新建的 key：

```bash
./node_modules/.bin/wrangler r2 object delete \
  sherlock-releases/notarized/latest/latest-mac.yml --remote
```

全部适用的公开元数据、不可变资源、差分更新、签名及包完整性检查均成功后，才执行滚动清理。先预演并确认 `deletedVersion` 是服务器中最早的版本，`deleteKeys` 全部严格位于同一个 `releases/v<deletedVersion>/` 下；再执行正式清理：

```bash
npm run release:cloudflare:prune-oldest -- \
  --bucket sherlock-releases \
  --version 0.6.4 \
  --plan "$sherlock_release_tmp/cloudflare-upload-plan.json" \
  --inventory config/sherlock-r2-release-inventory.json \
  --dry-run

npm run release:cloudflare:prune-oldest -- \
  --bucket sherlock-releases \
  --version 0.6.4 \
  --plan "$sherlock_release_tmp/cloudflare-upload-plan.json" \
  --inventory config/sherlock-r2-release-inventory.json
```

清理脚本只接受上传预演中标记为 `immutable` 且严格属于当前版本的 key；它逐个精确删除清单中最早版本的对象，并且仅在全部删除成功后更新仓库内的版本清单。若预演版本不符合预期、清单缺失或删除失败，停止清理并保留现场，不能改用模糊前缀或批量删除补救。

## 5.1. Homebrew 软件源同步

只有本次 Cloudflare 正式发布的全部适用公开验证通过后，才按 `docs/sherlock-homebrew.md` 同步 `awake-ai-lab/homebrew-tap`。使用最终签名、公证并 staple 后的 DMG：

```bash
node scripts/update-homebrew-cask.mjs \
  --version 0.6.4 \
  --dmg dist-release/sherlock-mac-arm64.dmg \
  --tap "$(brew --repository awake-ai-lab/tap)"
```

将示例版本替换为真实发布版本。工具核对正式 feed 的版本、固定 DMG URL、SHA-512、大小以及远端 HEAD，拒绝降级和同版本换包。通过后审查 Cask，运行 Homebrew 的解析/风格检查，创建中文提交并推送独立 Tap；再从公开仓库及 `brew info` 核验版本。Cask 维护 `auto_updates true`，保留客户端内更新；显式使用 `brew upgrade --cask ework-odyssey` 升级。不得使用可变下载别名和 `sha256 :no_check`。

Tap 更新失败时保留已经验证的 Cloudflare 发布，修复软件源步骤后重试；不得重新覆盖同版本 R2 对象。Cloudflare 回滚后禁止继续推进 Tap；若已推进则回退 Cask 提交并核验。滚动清理不得删除 Tap 当前版本所指向的安装包。

## 6. 源码同步

线上验证成功后，检查是否产生发布清单等新的受跟踪改动；若有，只暂存这些发布相关文件并创建中文提交，例如 `发布：记录 Sherlock 0.6.4 正式发布结果`。推送到：

```bash
git push https://github.com/hyf901111-design/dsh-desktop.git \
  HEAD:refs/heads/codex/sherlock-cloudflare-updates
```

大版本的 `V<version>` 注释标签只保存在本地；当前不要推送任何版本标签，因为 Fork 的完整 GitHub Release Secrets/Runner 尚未配置，远端标签可能触发失败的工作流。GitHub 推送失败不回滚已经验证成功的 Cloudflare 版本；修复认证后重试源码同步。

若既有 Fork 发布分支发生非快进分歧，禁止强推，也不要为了 Git 同步改写已经验证的发布提交。把当前发布提交推到新的版本化备份分支，例如：

```bash
git push https://github.com/hyf901111-design/dsh-desktop.git \
  HEAD:refs/heads/codex/sherlock-cloudflare-updates-0.6.4
```

此时 Cloudflare 发布保持有效，在最终报告中把主发布分支同步标记为待处理，并给出新备份分支链接。

## 完成标准

最终汇报分别列出：版本与提交、聚焦测试和类型检查、应用/DMG 签名、Cloudflare 元数据与 Range/缓存验证、差分更新校验（不做全量升级测试）、R2 最早版本精确清理、GitHub Fork 推送。所有发布步骤成功且无待处理故障后才称为“正式版发布完成”。
