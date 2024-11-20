# v1.8.1 - 2024/11/20 JST

#### Maintenance

* update `@actions/cache`, `@actions/core` [#72](https://github.com/irgaly/xcode-cache/pull/72)
* handle uncaughtException in post job [#73](https://github.com/irgaly/xcode-cache/pull/73)

# v1.8.0 - 2024/10/02 JST

#### Improve

* add cache-read-only feature [#63](https://github.com/irgaly/xcode-cache/pull/63)
    * refactor: cacheReadOnly condition [#68](https://github.com/irgaly/xcode-cache/pull/68)
* Add *.xcstrings to default mtime targets  [#69](https://github.com/irgaly/xcode-cache/pull/69)

#### Maintenance

* CI: update dist on ubuntu-latest [#60](https://github.com/irgaly/xcode-cache/pull/60)
* fix error message typo [#67](https://github.com/irgaly/xcode-cache/pull/67)

# v1.7.2 - 2024/04/06 JST

#### Maintenance

* update node 20.12.1 [#58](https://github.com/irgaly/xcode-cache/pull/58)
  * Support GitHub Actions node20 runtime

# v1.7.1 - 2023/12/01 JST

#### Fix

* Fix deleting cache API's 404 error handling [#50](https://github.com/irgaly/xcode-cache/pull/50)

# v1.7.0 - 2023/12/01 JST

#### Improve

* add output: restored-key,
  swiftpm-restored-key [#46](https://github.com/irgaly/xcode-cache/pull/46)
* add node-v120-darwin-arm64/nanoutimes.node [#47](https://github.com/irgaly/xcode-cache/pull/47)
* add delete-used-deriveddata-cache feature [#48](https://github.com/irgaly/xcode-cache/pull/48)

# v1.6.0 - 2023/11/16 JST

#### Improve

* add node-v93-darwin-arm64/nanoutimes.node [#44](https://github.com/irgaly/xcode-cache/pull/44)
    * Support GitHub Actions M1 Mac (macos-13-xlarge)

# v1.5.0 - 2023/10/05 JST

#### Improve

* add timestamp to logging [#41](https://github.com/irgaly/xcode-cache/pull/41)

# v1.4.0 - 2023/10/05 JST

#### Improve

* add set-output restored / swiftpm-restored [#39](https://github.com/irgaly/xcode-cache/pull/39)

# v1.3.0 - 2023/09/29 JST

#### Improve

* Add default targets: `**/*.xcassets/**/*` [#37](https://github.com/irgaly/xcode-cache/pull/37)

# v1.2.0 - 2023/09/28 JST

#### Improve

* Add default targets: .intentdefinition [#35](https://github.com/irgaly/xcode-cache/pull/35)

# v1.1.0 - 2023/09/27 JST

#### Improve

* Add default targets: .json, .xcframework, .framework [#34](https://github.com/irgaly/xcode-cache/pull/34)

# v1.0.0 - 2023/09/15 JST

Initial release.
