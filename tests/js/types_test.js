import { assert, assertEquals } from "./testutils"

function checkArgument(env) {
  assertEquals(env.namespace, 'namespace')
  assertEquals(env.candidate.text, 'text')
  assertEquals(env.engine.schema.id, '.default')
  env.candidate.text = 'new text'

  const config = env.engine.schema.config
  assertEquals(config.getBool('key'), null)
  assertEquals(config.getBool('key1'), true)
  assertEquals(config.getBool('key2'), false)
  assertEquals(config.getInt('key3'), 666)
  assertEquals(config.getDouble('key4'), 0.999)
  assertEquals(config.getString('key5'), 'string')

  const list = config.getList('list')
  assertEquals(list.getValueAt(0).getString(), 'item1')
  assertEquals(list.getValueAt(1).getString(), 'item2')
  assertEquals(list.getValueAt(2).getString(), 'item3')
  assertEquals(list.getValueAt(3), null)

  assert(!config.getList('none'), 'should not crash if the key does not exist')

  config.setString('greet', 'hello from js')

  const context = env.engine.context
  assertEquals(context.input, 'hello')

  assert(context.preedit !== null, 'preedit should not be null')
  assertEquals(context.preedit.text, 'hello', 'preedit should have text')
  assertEquals(context.preedit.caretPos, 5, 'preedit should have caretPos')
  assertEquals(context.preedit.selectStart, 0, 'preedit should have selectStart')
  assertEquals(context.preedit.selectEnd, 0, 'preedit should have selectEnd')

  context.input = 'world'

  env.newCandidate = new Candidate('js', 32, 100, 'the text', 'the comment', 888)

  // ensure adding extra fields to the qjs object would not break the quickjs engine
  env.newCandidate.extraField = 'extra field'
  assertEquals(env.newCandidate.extraField, 'extra field')

  testEnvUtilities(env)
  testTrie(env)
  testLevelDb(env)

  return env
}

function testSaveAndRemoveFile(env) {
  const testFilePath = env.currentFolder + '/test_save_file.txt'
  const testContent = 'Hello, World! 你好世界！'

  // Test saveFile
  const saveResult = env.saveFile(testFilePath, testContent)
  assert(saveResult === true, 'saveFile should return true on success')

  // Verify file exists
  assertEquals(env.fileExists(testFilePath), true, 'File should exist after saveFile')

  // Verify file content
  const loadedContent = env.loadFile(testFilePath)
  assertEquals(loadedContent, testContent, 'Loaded content should match saved content')

  // Test removeFile
  const removeResult = env.removeFile(testFilePath)
  assert(removeResult === true, 'removeFile should return true on success')

  // Verify file is removed
  assertEquals(env.fileExists(testFilePath), false, 'File should not exist after removeFile')

  // Test removing non-existent file
  const removeNonExistent = env.removeFile(testFilePath)
  assert(removeNonExistent === false, 'removeFile should return false for non-existent file')

  console.log('testSaveAndRemoveFile passed')
}

function testCreateAndRemoveDir(env) {
  const testDirPath = env.currentFolder + '/test_dir'
  const testSubDirPath = testDirPath + '/subdir'

  // Test createDir - create new directory
  const createResult = env.createDir(testDirPath)
  assert(createResult === true, 'createDir should return true on success')

  // Verify directory exists
  assertEquals(env.fileExists(testDirPath), true, 'Directory should exist after createDir')

  // Test createDir with exist_ok = true (should not error if exists)
  const createAgainResult = env.createDir(testDirPath, true)
  assert(createAgainResult === true, 'createDir with exist_ok=true should return true')

  // Test createDir with exist_ok = false (should fail if exists)
  const createAgainNoExistOk = env.createDir(testDirPath, false)
  assert(createAgainNoExistOk === false, 'createDir with exist_ok=false should return false if exists')

  // Test createDir - create nested directory
  const createNestedResult = env.createDir(testSubDirPath, true)
  assert(createNestedResult === true, 'createDir for nested dir should return true')

  // Test removeDir - remove directory
  const removeResult = env.removeDir(testDirPath)
  assert(removeResult === true, 'removeDir should return true on success')

  // Verify directory is removed
  assertEquals(env.fileExists(testDirPath), false, 'Directory should not exist after removeDir')

  // Test removing non-existent directory
  const removeNonExistent = env.removeDir(testDirPath)
  assert(removeNonExistent === false, 'removeDir should return false for non-existent directory')

  console.log('testCreateAndRemoveDir passed')
}

function testEnvUtilities(env) {
  const info = env.getRimeInfo()
  console.log(`Rime info = ${info}`)
  assert(info.includes('libRime v'))
  assert(info.includes('libRime-qjs v'))
  assert(info.includes('Process RSS Mem: '))

  assert('macOS|Windows|Linux'.includes(env.os.name), 'os.name should be one of macOS|Windows|Linux')
  assert(env.os.version.length > 0, 'os.version should not be empty')
  assert(env.os.architecture.length > 0, 'os.architecture should not be empty')

  console.error(`This is an error message.`)

  // ensure engine.processKey would not crash the program
  env.engine.processKey('Down')
  env.engine.processKey('InvalidKey')

  const echo = env.os.name === 'Windows' ? 'cmd.exe /c echo libRime-qjs' : 'echo libRime-qjs'
  assertEquals(env.popen(echo).trim(), 'libRime-qjs')

  const start = new Date()
  const ping = env.os.name === 'Windows' ? 'ping 127.0.0.1 -n 3' : 'ping 127.0.0.1 -t 3'
  let isTimedout = false
  try {
    const output = env.popen(ping, 500)
    console.error(`env.popen('ping xxx') should be timed-out, but got ${output}`)
  } catch (e) {
    isTimedout = true
    const end = new Date()
    assert(end.getTime() < 1000 + start.getTime(), 'It should be timed-out in 500ms.' )
    console.error('expected timed-out error', e)
  }
  assert(isTimedout, `env.popen('ping xxx') should be timed-out`)

  assertEquals(env.fileExists(env.currentFolder + '/js/types_test.js'), true)
  assertEquals(env.fileExists(env.currentFolder + '/js/not_found.js'), false)

  // Test saveFile and removeFile
  testSaveAndRemoveFile(env)

  // Test createDir and removeDir
  testCreateAndRemoveDir(env)

  // test load file with utf-8 chars
  const content = env.loadFile(env.currentFolder + '/js/types_test.js')
  assert(content.includes('测试 UTF-8 编码'))
}

function testTrie(env) {
  const trie = new Trie()
  trie.loadTextFile(env.currentFolder + '/dummy_dict.txt', {lines: 6})
  checkTrieData(trie)

  trie.saveToBinaryFile(env.currentFolder + '/dumm.bin')
  const trie2 = new Trie()
  trie2.loadBinaryFile(env.currentFolder + '/dumm.bin')
  checkTrieData(trie2)
}

function testLevelDb(env) {
  console.log('testLevelDb')
  const levelDb = new LevelDb()
  levelDb.loadTextFile(env.currentFolder + '/dummy_dict.txt', {lines: 6})
  levelDb.saveToBinaryFile(env.currentFolder + '/dumm.ldb')
  checkTrieData(levelDb)
  levelDb.close()

  const levelDb2 = new LevelDb()
  levelDb2.loadBinaryFile(env.currentFolder + '/dumm.ldb')
  checkTrieData(levelDb2)
}

function checkTrieData(trie) {
  const result1 = trie.find('accord')
  assertEquals(result1, '[ә\'kɒ:d]; n. 一致, 调和, 协定\\n vt. 给与, 使一致\\n vi. 相符合')
  const result2 = trie.find('accordion')
  assertEquals(result2, '[ә\'kɒ:djәn]; n. 手风琴\\n a. 可折叠的')
  const result3 = trie.find('nonexistent-word')
  assertEquals(result3, null)
  const prefix_results = trie.prefixSearch('accord')
  assertEquals(prefix_results.length, 6)
}


globalThis.checkArgument = checkArgument

const load_file_test_data = [
  'Hello, 世界!',
  '测试 UTF-8 编码',
  '🌟 Emoji test',
  'Mixed content: あいうえお',
]

// to bundle it to IIFE format to run in JavaScriptCore
export class DummyClass {}
