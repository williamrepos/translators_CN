{
	"translatorID": "5c95b67b-41c5-4f55-b71a-48d5d7183063",
	"label": "CNKI",
	"creator": "Aurimas Vinckevicius, Xingzhong Lin",
	"target": "^https?://([^/]+\\.)?cnki\\.net",
	"minVersion": "3.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "gcs",
	"lastUpdated": "2020-09-22 03:14:15"
}

/*
	***** BEGIN LICENSE BLOCK *****
	CNKI(China National Knowledge Infrastructure) Translator
	Copyright © 2013 Aurimas Vinckevicius
	This file is part of Zotero.
	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
	GNU Affero General Public License for more details.
	You should have received a copy of the GNU Affero General Public License
	along with Zotero. If not, see <http://www.gnu.org/licenses/>.
	***** END LICENSE BLOCK *****
*/

// Fetches RefWorks records for provided IDs and calls onDataAvailable with resulting text
// ids should be in the form [{dbname: "CDFDLAST2013", filename: "1013102302.nh"}]
function getRefWorksByID(ids, onDataAvailable) {
	if (!ids.length) return;
	var { dbname, filename, url } = ids.shift();
	var postData = "formfilenames=" + encodeURIComponent(dbname + "!" + filename + "!1!0,")
		+ '&hid_kLogin_headerUrl=/KLogin/Request/GetKHeader.ashx%3Fcallback%3D%3F'
		+ '&hid_KLogin_FooterUrl=/KLogin/Request/GetKHeader.ashx%3Fcallback%3D%3F'
		+ '&CookieName=FileNameS';
	ZU.doPost('https://kns.cnki.net/kns/ViewPage/viewsave.aspx?displayMode=Refworks', postData,
		function (text) {
			var parser = new DOMParser();
			var html = parser.parseFromString(text, "text/html");
			var data = ZU.xpath(html, "//table[@class='mainTable']//td")[0].innerHTML
				.replace(/\n/g, '<br>')
				.replace(/<br>\s+/g, ';')
				.replace(/(<br>)+/g, '\n')
				.replace(/^RT\s+Conference Proceeding/gmi, 'RT Conference Proceedings')
				.replace(/^RT\s+Dissertation\/Thesis/gmi, 'RT Dissertation')
				.replace(/;;/g, ';') // 保留作者中一个英文分号
				.replace(/^ AB/g, 'AB') // 去除AB前空格
				.replace(/vo (\d+)\n/, "VO $1\n")  // 修改vo 大小写
				.replace(
					/^(A[1-4]|U2)\s*([^\r\n]+)/gm,
					function (m, tag, authors) {
						authors = authors.split(/\s*[;，,]\s*/); // that's a special comma
						if (!authors[authors.length - 1].trim()) authors.pop();
						return 'A1' + ' ' + authors.join('\n' + 'A1' + ' ');  // Use A1 tag instead
					}
				);
			Z.debug(data);
			onDataAvailable(data, url);
			// If more results, keep going
			if (ids.length) {
				getRefWorksByID(ids, onDataAvailable);
			}
		}
	);
}


function getIDFromURL (url) {
	if (!url) return false;
	var dbname = url.match(/[?&](?:db|table)[nN]ame=([^&#]*)/i);
	var filename = url.match(/[?&]filename=([^&#]*)/i);
	var dbcode = url.match(/[?&]dbcode=([^&#]*)/i);
	if (
		!filename ||
		!filename[1] ||
		!dbcode ||
		!dbcode[1] ||
		!dbname ||
		!dbname[1]
	)
		return false;
	return { dbname: dbname[1] , filename: filename[1], dbcode: dbcode[1], url: url };
}

// Get dbname and filename from pre-released article web page.
function getIDFromHeader(doc, url) {
	var dbname = ZU.xpath(doc, "//input[@id='paramdbname']");
	var dbcode = ZU.xpath(doc, "//input[@id='paramdbcode']");
	var filename = ZU.xpath(doc, "//input[@id='paramfilename']");
	if (
		filename.length +
		dbcode.length +
		dbname.length <3
	) {
		return false;
	}
	return { dbname: dbname[0].value , filename: filename[0].value, dbcode: dbcode[0].value, url: url };
}

function getIDFromPage(doc, url) {
	return getIDFromURL(url)
		|| getIDFromURL(ZU.xpathText(doc, '//div[@class="zwjdown"]/a/@href'))
		|| getIDFromHeader(doc, url);
}

function getTypeFromDBName(dbname) {
	var dbType = {
		CJFQ: "journalArticle",
		CJFD: "journalArticle",
		CAPJ: "journalArticle",
		SJES: "journalArticle",
		SJPD: "journalArticle",
		SSJD: "journalArticle",
		CCJD: "journalArticle",
		CDFD: "thesis",
		CMFD: "thesis",
		CLKM: "thesis",
		CCND: "newspaperArticle",
		CPFD: "conferencePaper",
		SCPD: "patent"
	};
	var db = dbname.substr(0, 4).toUpperCase();
	if (dbType[db]) {
		return dbType[db];
	}
	else {
		return false;
	}
}

function getItemsFromSearchResults(doc, url, itemInfo) {
	var links, aXpath, fileXpath = '';
	if (url.includes('JournalDetail')) { // for journal detail page
		links = ZU.xpath(doc, "//dl[@id='CataLogContent']/dd");
		aXpath = "./span/a";
		fileXpath = "./ul/li/a";
	}
	else { // for search result page
		var result = doc.querySelector('table.result-table-list');
		links = doc.querySelectorAll("table.result-table-list tbody tr");
		aXpath = './td/a[@class="fz14"]';
		fileXpath = "./td[@class='operat']/a[contains(@class, 'downloadlink')]";
	}
	if (!links.length) {
		return false;
	}
	var items = {};
	for (var i = 0, n = links.length; i < n; i++) {
		// Z.debug(links[i].innerHTML)
		var a = ZU.xpath(links[i], aXpath)[0];
		var title = a.innerText;
		if (title) title = ZU.trimInternal(title);
		var id = getIDFromURL(a.href);
		var itemUrl = "";
		// Now can get db data from url in new version
		// English articles
		if (!id) {
			var td = ZU.xpath(links[i], "./td[@class='operat']/a");
			itemUrl = `https://kns.cnki.net/KCMS/detail/${a.href}`;
			id = { 
				dbname: td[0].getAttribute("data-table"), 
				filename: td[0].getAttribute("data-filename"),
				dbcode: td[1].getAttribute("data-dbname"),
				url: itemUrl};
		} else {
			itemUrl = `https://kns.cnki.net/KCMS/detail/detail.aspx?dbcode=${id.dbcode}&dbname=${id.dbname}&filename=${id.filename}&v=`;
			id.url =  itemUrl;
		}
		// download link in search result
		var filelink = ZU.xpath(links[i], fileXpath);
		if (!title || !id) continue;
		if (itemInfo) {
			itemInfo[itemUrl] = { id: id };
			if (filelink.length) {
				filelink = filelink[0].href;
				itemInfo[itemUrl].filelink = filelink;
			}
		}
		items[itemUrl] = links[i].innerText;
	}
	return items;
}

function detectWeb(doc, url) {
	// Z.debug(doc);
	var id = getIDFromPage(doc, url);
	Z.debug(id);
	if (id) {
		return getTypeFromDBName(id.dbname);
	}
	// Add new version kns8
	else if (
		url.match(/kns\/brief\/(default_)?result\.aspx/i) 
		|| url.match(/JournalDetail/i) // Journal home page
		|| url.match(/kns8?\/defaultresult\/index/i) // search page
		|| url.match(/KNS8?\/AdvSearch\?/i)) {  // search page
		return "multiple";
	}
	else {
		return false;
	}
}

function doWeb(doc, url) {
	Z.debug("----------------CNKI 20200910---------------------");
	if (detectWeb(doc, url) == "multiple") {
		var itemInfo = {};
		var items = getItemsFromSearchResults(doc, url, itemInfo);
		// Z.debug(itemInfo);
		if (!items) return false;// no items
		Z.selectItems(items, function (selectedItems) {
			if (!selectedItems) return;
			var ids = [];
			for (var url in selectedItems) {
				ids.push(itemInfo[url].id);
			}
			scrape(ids, doc, itemInfo);
		});
	}
	else {
		scrape([getIDFromPage(doc, url)], doc);
	}
}

function scrape(ids, doc, itemInfo) {
	getRefWorksByID(ids, function (text, url) {
		var translator = Z.loadTranslator('import');
		translator.setTranslator('1a3506da-a303-4b0a-a1cd-f216e6138d86'); // RefWorks Tagged
		translator.setString(text);
		translator.setHandler('itemDone', function (obj, newItem) {
			// add PDF/CAJ attachments
			// var loginStatus = loginDetect(doc);
			var loginStatus = true;
			// If you want CAJ instead of PDF, set keepPDF = false
			// 如果你想将PDF文件替换为CAJ文件，将下面一行 keepPDF 设为 false
			var keepPDF = Z.getHiddenPref('CNKIPDF');
			if (keepPDF === undefined) {
				keepPDF = true;
			}
			// Z.debug('loginStatus: '+loginStatus);
			if (itemInfo && itemInfo[url].filelink) { // search result
				var fileUrl = '';
				var fileTitle =  "Full Text PDF"
				var mimeType = "application/pdf";
				if (keepPDF) {
					// replace CAJ with PDF
					if (itemInfo[url].filelink.includes('&dflag=nhdown')) {
						fileUrl = itemInfo[url].filelink.replace('&dflag=nhdown', '&dflag=pdfdown');
					} else {
						fileUrl = itemInfo[url].filelink + "&dflag=pdfdown";
					}
				}
				else {
					fileUrl = itemInfo[url].filelink;
					mimeType = null;
					fileTitle = "Full Text CAJ"
				}
				newItem.attachments = [{
					title:fileTitle,
					mimeType: mimeType,
					url: fileUrl
				}];
			}
			else if (!itemInfo) { // detail page
				newItem.attachments = getAttachments(doc, newItem, keepPDF);
			}
			// split names, Chinese name split depends on Zotero Connector preference translators.zhnamesplit
			var zhnamesplit = Z.getHiddenPref('zhnamesplit');
			if (zhnamesplit === undefined) {
				zhnamesplit = true;
			}
			for (var i = 0, n = newItem.creators.length; i < n; i++) {
				var creator = newItem.creators[i];
				if (newItem.itemType == 'thesis' && i == n-1) {  // The last author is Advisor in thesis
					creator.creatorType = 'contributor';  // Here is contributor
				}
				if (creator.firstName) continue;
				
				var lastSpace = creator.lastName.lastIndexOf(' ');
				if (creator.lastName.search(/[A-Za-z]/) !== -1 && lastSpace !== -1) {
					// western name. split on last space
					creator.firstName = creator.lastName.substr(0, lastSpace);
					creator.lastName = creator.lastName.substr(lastSpace + 1);
				}
				else if (zhnamesplit) {
					// zhnamesplit is true, split firstname and lastname.
					// Chinese name. first character is last name, the rest are first name
					creator.firstName = creator.lastName.substr(1);
					creator.lastName = creator.lastName.charAt(0);
				}
			}
			
			// clean up tags. Remove numbers from end
			for (var j = 0, l = newItem.tags.length; j < l; j++) {
				newItem.tags[j] = newItem.tags[j].replace(/:\d+$/, '');
			}
			newItem.url = url;
			if (!itemInfo) {
				var doi = doc.querySelector("#catalog_DOI"); // add DOI
				if (doi) {
					newItem.DOI = doi.nextSibling.text;
				}
				var moreClick = ZU.xpath(doc, "//span/a[@id='ChDivSummaryMore']");
				if (moreClick.length) {
					moreClick[0].click();// click to get a full abstract in a single article page
					newItem.abstractNote = ZU.xpath(doc, "//span[@id='ChDivSummary']")[0].innerText;
				}
			}
			if (newItem.abstractNote) {
				newItem.abstractNote = newItem.abstractNote.replace(/\s*[\r\n]\s*/g, '\n')
															.replace(/&lt;.*?&gt;/g, "");
			}
			newItem.title = ZU.trimInternal(newItem.title);
			// CN 中国刊物编号，非refworks中的callNumber
			// CN in CNKI refworks format explains Chinese version of ISSN
			newItem.callNumber = null;
			newItem.complete();
		});
		
		translator.translate();
	});
}

// get pdf download link
function getPDF(doc, itemType) {
	// retrieve PDF links from CNKI oversea
	var pdf = '';
	if (itemType == 'thesis') {
		pdf = ZU.xpath(doc, "//div[@id='DownLoadParts']/a[contains(text(), 'PDF')]");
	}
	else {
		pdf = ZU.xpath(doc, "//a[@name='pdfDown']");
	}
	return pdf.length ? pdf[0].href : false;
}

// caj download link, default is the whole article for thesis.
function getCAJ(doc, itemType) {
	// //div[@id='DownLoadParts']
	var caj = '';
	if (itemType == 'thesis') {
		caj = ZU.xpath(doc, "//div[@id='DownLoadParts']/a");
	}
	if (!caj.length) {
		caj = ZU.xpath(doc, "//a[@name='cajDown']");
	}
	return caj.length ? caj[0].href : false;
}

// add pdf or caj to attachments, default is pdf
function getAttachments(doc, item, keepPDF) {
	var attachments = [];
	var pdfurl = getPDF(doc, item.itemType);
	var cajurl = getCAJ(doc, item.itemType);
	if (keepPDF && item.itemType == "thesis") {
		pdfurl = cajurl.replace('&dflag=nhdown', '&dflag=pdfdown');
	}
	// Z.debug('pdf' + pdfurl);
	// Z.debug('caj' + cajurl);
	if (pdfurl) {
		attachments.push({
			title: "Full Text PDF",
			mimeType: "application/pdf",
			url: pdfurl
		});
	}
	else if (cajurl) {
		attachments.push({
			title: "Full Text CAJ",
			url: cajurl
		});
	}
	return attachments;
}


// detect login status
// loginState in search result, -1 means logout
// function loginDetect(doc) {
// 	var loginUser = ZU.xpath(doc, "//input[(@id='loginuserid') or (@id='userid')]");
// 	if (loginUser.length && loginUser[0].value) {
// 		return true;
// 	}
// 	else {
// 		return false;
// 	}
// }

/** BEGIN TEST CASES **/
var testCases = [
	{
		"type": "web",
		"url": "https://kns.cnki.net/KCMS/detail/detail.aspx?dbcode=CJFQ&dbname=CJFDLAST2015&filename=SPZZ201412003&v=MTU2MzMzcVRyV00xRnJDVVJMS2ZidVptRmkva1ZiL09OajNSZExHNEg5WE5yWTlGWjRSOGVYMUx1eFlTN0RoMVQ=",
		"items": [
			{
				"itemType": "journalArticle",
				"title": "基于部分酸水解-亲水作用色谱-质谱的黄芪多糖结构表征",
				"creators": [
					{
						"lastName": "梁",
						"firstName": "图",
						"creatorType": "author"
					},
					{
						"lastName": "傅",
						"firstName": "青",
						"creatorType": "author"
					},
					{
						"lastName": "辛",
						"firstName": "华夏",
						"creatorType": "author"
					},
					{
						"lastName": "李",
						"firstName": "芳冰",
						"creatorType": "author"
					},
					{
						"lastName": "金",
						"firstName": "郁",
						"creatorType": "author"
					},
					{
						"lastName": "梁",
						"firstName": "鑫淼",
						"creatorType": "author"
					}
				],
				"date": "2014",
				"ISSN": "1000-8713",
				"abstractNote": "来自中药的水溶性多糖具有广谱治疗和低毒性特点,是天然药物及保健品研发中的重要组成部分。针对中药多糖结构复杂、难以表征的问题,本文以中药黄芪中的多糖为研究对象,采用\"自下而上\"法完成对黄芪多糖的表征。首先使用部分酸水解方法水解黄芪多糖,分别考察了水解时间、酸浓度和温度的影响。在适宜条件(4 h、1.5mol/L三氟乙酸、80℃)下,黄芪多糖被水解为特征性的寡糖片段。接下来,采用亲水作用色谱与质谱联用对黄芪多糖部分酸水解产物进行分离和结构表征。结果表明,提取得到的黄芪多糖主要为1→4连接线性葡聚糖,水解得到聚合度4~11的葡寡糖。本研究对其他中药多糖的表征具有一定的示范作用。",
				"issue": "12",
				"language": "中文;",
				"libraryCatalog": "CNKI",
				"pages": "1306-1312",
				"publicationTitle": "色谱",
				"url": "https://kns.cnki.net/KCMS/detail/detail.aspx?dbcode=CJFQ&dbname=CJFDLAST2015&filename=SPZZ201412003&v=MTU2MzMzcVRyV00xRnJDVVJMS2ZidVptRmkva1ZiL09OajNSZExHNEg5WE5yWTlGWjRSOGVYMUx1eFlTN0RoMVQ=",
				"volume": "32",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [
					{
						"tag": "Astragalus"
					},
					{
						"tag": "characterization"
					},
					{
						"tag": "hydrophilic interaction liquid chromatography(HILIC)mass spectrometry(MS)"
					},
					{
						"tag": "partial acid hydrolysis"
					},
					{
						"tag": "polysaccharides"
					},
					{
						"tag": "亲水作用色谱"
					},
					{
						"tag": "多糖"
					},
					{
						"tag": "表征"
					},
					{
						"tag": "质谱"
					},
					{
						"tag": "部分酸水解"
					},
					{
						"tag": "黄芪"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://kns.cnki.net/KCMS/detail/detail.aspx?dbcode=CMFD&dbname=CMFD201701&filename=1017045605.nh&v=MDc3ODZPZVorVnZGQ3ZrV3JyT1ZGMjZHYk84RzlmTXFwRWJQSVI4ZVgxTHV4WVM3RGgxVDNxVHJXTTFGckNVUkw=",
		"items": [
			{
				"itemType": "thesis",
				"title": "黄瓜共表达基因模块的识别及其特点分析",
				"creators": [
					{
						"lastName": "林",
						"firstName": "行众",
						"creatorType": "author"
					}
				],
				"date": "2015",
				"abstractNote": "黄瓜(Cucumis sativus L.)是我国最大的保护地栽培蔬菜作物,也是植物性别发育和维管束运输研究的重要模式植物。黄瓜基因组序列图谱已经构建完成,并且在此基础上又完成了全基因组SSR标记开发和涵盖330万个变异位点变异组图谱,成为黄瓜功能基因研究的重要平台和工具,相关转录组研究也有很多报道,不过共表达网络研究还是空白。本实验以温室型黄瓜9930为研究对象,选取10个不同组织,进行转录组测序,获得10份转录组原始数据。在对原始数据去除接头与低质量读段后,将高质量读段用Tophat2回贴到已经发表的栽培黄瓜基因组序列上。用Cufflinks对回贴后的数据计算FPKM值,获得10份组织的24274基因的表达量数据。计算结果中的回贴率比较理想,不过有些基因的表达量过低。为了防止表达量低的基因对结果的影响,将10份组织中表达量最大小于5的基因去除,得到16924个基因,进行下一步分析。共表达网络的构建过程是将上步获得的表达量数据,利用R语言中WGCNA(weighted gene co-expression network analysis)包构建共表达网络。结果得到的共表达网络包括1134个模块。这些模块中的基因表达模式类似,可以认为是共表达关系。不过结果中一些模块内基因间相关性同其他模块相比比较低,在分析过程中,将模块中基因相关性平均值低于0.9的模块都去除,最终得到839个模块,一共11,844个基因。共表达的基因因其表达模式类似而聚在一起,这些基因可能与10份组织存在特异性关联。为了计算模块与组织间的相关性,首先要对每个模块进行主成分分析(principle component analysis,PCA),获得特征基因(module eigengene,ME),特征基因可以表示这个模块所有基因共有的表达趋势。通过计算特征基因与组织间的相关性,从而挑选出组织特异性模块,这些模块一共有323个。利用topGO功能富集分析的结果表明这些特异性模块所富集的功能与组织相关。共表达基因在染色体上的物理位置经常是成簇分布的。按照基因间隔小于25kb为标准。分别对839个模块进行分析,结果发现在71个模块中共有220个cluster,这些cluster 一般有2～5个基因,cluster中的基因在功能上也表现出一定的联系。共表达基因可能受到相同的转录调控,这些基因在启动子前2kb可能会存在有相同的motif以供反式作用元件的结合起到调控作用。对839个模块中的基因,提取启动子前2kb的序列,上传到PLACE网站进行motif分析。显著性分析的结果表明一共有367个motif存在富集,其中6个motif已经证实在黄瓜属植物中发挥作用。最后结合已经发表的黄瓜苦味生物合成途径研究,找到了 3个模块,已经找到的11个基因中,有10个基因在这4个模块中。这些模块的功能富集也显示与苦味合成相关,同时这些参与合成的基因在染色体上也成簇分布。本论文所描述的方法结合了转录组测序与网络分析方法,发现了黄瓜中的共表达基因模块,为黄瓜基因的共表达分析提供了非常重要的研究基础和数据支持。",
				"language": "中文;",
				"libraryCatalog": "CNKI",
				"thesisType": "硕士",
				"university": "南京农业大学",
				"url": "https://kns.cnki.net/KCMS/detail/detail.aspx?dbcode=CMFD&dbname=CMFD201701&filename=1017045605.nh&v=MDc3ODZPZVorVnZGQ3ZrV3JyT1ZGMjZHYk84RzlmTXFwRWJQSVI4ZVgxTHV4WVM3RGgxVDNxVHJXTTFGckNVUkw=",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [
					{
						"tag": "co-expression"
					},
					{
						"tag": "cucumber"
					},
					{
						"tag": "network"
					},
					{
						"tag": "transcriptome"
					},
					{
						"tag": "共表达"
					},
					{
						"tag": "网络"
					},
					{
						"tag": "转录组"
					},
					{
						"tag": "黄瓜"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://kns.cnki.net/KCMS/detail/detail.aspx?dbcode=CPFD&dbname=CPFD9908&filename=OYDD199010001004&v=MDI5NTRITnI0OUZaZXNQQ0JOS3VoZGhuajk4VG5qcXF4ZEVlTU9VS3JpZlplWnZGeW5tVTdqSkpWb1RLalRQYXJLeEY5",
		"items": [
			{
				"itemType": "conferencePaper",
				"title": "辽西区新石器时代考古学文化纵横",
				"creators": [
					{
						"lastName": "朱",
						"firstName": "延平",
						"creatorType": "author"
					}
				],
				"date": "1990",
				"abstractNote": "<正>辽西区的范围从大兴安岭南缘到渤海北岸,西起燕山西段,东止辽河平原,基本上包括内蒙古的赤峰市(原昭乌达盟)、哲里木盟西半部,辽宁省西部和河北省的承德、唐山、廊坊及其邻近的北京、天津等地区。这一地区的古人类遗存自旧石器时代晚期起,就与同属东北的辽东区有着明显的不同,在后来的发展中,构成自具特色的一个考古学文化区,对我国东北部起过不可忽视的作用。以下就辽西地区新石器时代的考古学文化序列、编年、谱系及有关问题简要地谈一下自己的认识。",
				"language": "中文;",
				"libraryCatalog": "CNKI",
				"pages": "6",
				"proceedingsTitle": "内蒙古东部区考古学文化研究文集",
				"publisher": "中国社会科学院考古研究所、内蒙古文物考古研究所、赤峰市文化局",
				"url": "https://kns.cnki.net/KCMS/detail/detail.aspx?dbcode=CPFD&dbname=CPFD9908&filename=OYDD199010001004&v=MDI5NTRITnI0OUZaZXNQQ0JOS3VoZGhuajk4VG5qcXF4ZEVlTU9VS3JpZlplWnZGeW5tVTdqSkpWb1RLalRQYXJLeEY5",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [
					{
						"tag": "兴隆洼文化"
					},
					{
						"tag": "努鲁儿虎山"
					},
					{
						"tag": "半坡文化"
					},
					{
						"tag": "夹砂陶"
					},
					{
						"tag": "富河文化"
					},
					{
						"tag": "小河沿文化"
					},
					{
						"tag": "庙底沟文化"
					},
					{
						"tag": "彩陶花纹"
					},
					{
						"tag": "文化纵横"
					},
					{
						"tag": "新石器时代考古"
					},
					{
						"tag": "红山文化"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://oversea.cnki.net/KCMS/detail/detail.aspx?dbcode=CAPJ&dbname=CAPJDAY&filename=SDYB20200908000&v=MTM4NjRDTEw3UjdxZForWm1GeW5sVWJ2TEkxaz1OaW5TYkxHNEhOSE1wbzlOWk9zUFl3OU16bVJuNmo1N1QzZmxxV00w",
		"items": [
			{
				"itemType": "journalArticle",
				"title": "新型冠状病毒肺炎2例报告",
				"creators": [
					{
						"lastName": "牛",
						"firstName": "占丛",
						"creatorType": "author"
					},
					{
						"lastName": "王",
						"firstName": "彦霞",
						"creatorType": "author"
					},
					{
						"lastName": "王",
						"firstName": "晓亚",
						"creatorType": "author"
					},
					{
						"lastName": "王",
						"firstName": "晓庆",
						"creatorType": "author"
					},
					{
						"lastName": "李",
						"firstName": "亚轻",
						"creatorType": "author"
					},
					{
						"lastName": "边",
						"firstName": "竞",
						"creatorType": "author"
					}
				],
				"ISSN": "1671-7554",
				"abstractNote": "<正>新型冠状病毒（2019-Novel coronavirus,2019-nCov）属于β属的冠状病毒,感染后引起的新型冠状病毒肺炎（Coronavirus Disease 2019,COVID-19）可引起肺、肝、脾、肾、心等多脏器病理改变[1],肺部受损尤其严重。对COVID-19死亡患者病理学研究发现,主要表现为肺泡上皮损伤和透明膜的形成,与重症急性呼吸综合征（severe acute respiratory syn-drome,SARS）极其相似[2]。",
				"language": "中文",
				"libraryCatalog": "CNKI",
				"pages": "1-3",
				"publicationTitle": "山东大学学报(医学版)",
				"url": "https://oversea.cnki.net/KCMS/detail/detail.aspx?dbcode=CAPJ&dbname=CAPJDAY&filename=SDYB20200908000&v=MTM4NjRDTEw3UjdxZForWm1GeW5sVWJ2TEkxaz1OaW5TYkxHNEhOSE1wbzlOWk9zUFl3OU16bVJuNmo1N1QzZmxxV00w",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [
					{
						"tag": "新型冠状病毒肺炎"
					},
					{
						"tag": "核酸检测"
					},
					{
						"tag": "流行病学史"
					},
					{
						"tag": "胸部CT"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	}
]
/** END TEST CASES **/
