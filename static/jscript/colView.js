//use for automatically converting types for query and syntax hilighting
var regBool = new RegExp(/^(false|true)$/)
var regStr = new RegExp(/^".*"$/)
var regNum = new RegExp(/^(-)?[0-9]\d*(\.\d+)?$/)
var regNone = new RegExp(/^null$/)
var regOid = new RegExp(/^oid:([0-9A-Fa-f]{24})$/)
var regDate = new RegExp(/^dt:([0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2}:[0-9]{2})?)$/)

//this is a dictionary where each index corresponds to the correct integer type when using the $type query
var typeTypes = ['Double', 'String', 'Object', 'Array', 'Binary Data', 'Undefined (deprecated', 'Object id', 'Boolean', 'Date', 'Null', 'Regular Expression', 'Javascript', 'Symbol', 'Javascript (with scope', '32-bit integer', 'Timestamp', '64-bit integer']

//format is <className>:[<regex>,<conversion function for JSON>]
var formats = {'boolType':[regBool, function(val){if (val=="false") return false; else return true}, 'Boolean'],
'stringType':[regStr, function(val){if(val=="" || val=='') return val; return val.substring(1,val.length-1)}, 'String'],
'numType':[regNum, function(val){return Number(val)}, 'Number'],
'noneType':[regNone, function(val){return null}, 'None'],
'oidType':[regOid, function(val){return {'$oid':regOid.exec(val)[1]}}, "Object ID"],
'dateType':[regDate, function(val){return {'$date':(new Date(regDate.exec(val)[1])).getTime()/1000}}, 'Date'],
}

//keep track of where we are in the search query for paging
var pageSize = 10;
var querySkip = 0;


function appendCriteriaField(){
	var newCrit = $('<div>',{'class':"oneCrit", 'style':'display:none;'})
	var field = $('<input>',{'type':'text', 'class':'field', 'placeholder':'field','onchange':"queryChange(this)"})
	makeAutocompleteField(field)

	var select = $('<select>', {'class':'operation', 'onchange':"queryChange(this)"})
	var ops = ["$eq","$ne","$gt","$gte","$lt","$lte","$exists","$size","$type"]
	for(var i=0; i<ops.length;i++)
		select.append($('<option>', {'value':ops[i],'html':ops[i]}))
		
	var value = $("<input>",{'type':'text','class':'value','placeholder':'value'})
	$(value).keyup(function(self){formatValueDiv(self.target);queryChange(self.target)})
	
	//var valIndicator = $("<span>",{'class':'valTypeIndicator'})
	var wrapper = $("<span>", {'class':'valWrapper'})
	var removeIcon = $('<img>', {'class':'operatorIcon', 'src':'/static/images/remove-icon.png','style':"cursor:pointer;cursor:hand;"})
	removeIcon.click(function(){$(this).parent().slideUp(200,function(){$(this).remove()})})
	
	
	
	
	$(newCrit).append(field)
	$(newCrit).append(select)
	var ul = $("<ul>",{'class':'nobullets'})
	var li1 = $("<li>"); li1.append(value)
	var li2 = $("<li>", {'class':'valTypeIndicator'})
	ul.append(li1)
	ul.append(li2)
	$(newCrit).append(ul)
	$(newCrit).append(removeIcon)
	$("#queryDiv").append(newCrit)
	var numCrits = $("#queryDiv").children().length
	//if this is the first field, down't do smooth slide.  This avoids slide-in when page loads
	$(newCrit).slideDown((numCrits>1)?100:0)
} //appendCriteriaField

function appendUpdateField(){
	var newCrit = 5;
} //appendUpdateField

//takes in an input field and turns it into an autocomplete field if a schema exists.  Otherwise it does nothing
function makeAutocompleteField(input){
	if(dbKeys){ //only add autocomplete if the keys have been scanned
		$(input).autocomplete({'source':dbKeys,'minLength':0}).focus(function () {
		$(this).autocomplete("search"); //makes the autocomplete show immediately on focus
	})}
} //makeAutocompleteField

//turns an input field into a field autocompleted with fields that have a 2d index.
function make2dAutocompleteField(input){
	//make a special catcomplete class for creating the category header
	 $.widget( "custom.catcomplete", $.ui.autocomplete, {
_renderMenu: function( ul, items ) {
var that = this,
currentCategory = "";
$.each( items, function( index, item ) {
if ( item.category != currentCategory ) {
ul.append( "<li style='font-weight:bold;' class='ui-autocomplete-category'>" + item.category + "</li>" );
currentCategory = item.category;
}
that._renderItemData( ul, item );
});
}
});
	//convert indexes2d to categorized-formatted version for jquery-ui autocomplete
	categoried = []
	for(key in indexes2d){
		var newDic = {}
		newDic['label'] = indexes2d[key]
		newDic['category'] = "Fields with a 2D index"
		categoried.push(newDic)
	}
	if(indexes2d){ //only add autocomplete if the keys have been scanned
		$(input).catcomplete({'source':categoried,'minLength':0}).focus(function () {
		$(this).catcomplete("search"); //makes the autocomplete show immediately on focus
	})}
}  //make2dAutocompleteField



function queryChange(self){
	var oneCrit = $(self).parents('.oneCrit')
	var field = $(oneCrit).children('.field')[0]
	var operation = $(oneCrit).children('.operation')[0]
	var value = $(oneCrit).find('.value')[0]
	
	oneCrit.attr('data-field',$(field).val())
	oneCrit.attr('data-operation',$(operation).val())
	oneCrit.attr('data-value',$(value).val())
	
	opVal = $(operation).val();
	//set the tooltip helper for $type
	$(value).attr("title", "") //need a dummy title for the 'content' field to work
	if(opVal == "$type"){
		
		$(value).tooltip({'content':function(){var ret = "<div style='font-weight:bold'>Integer correspondences for $type query</div>"
			for(var i=0;i<typeTypes.length;i++)
				ret += "<div>"+ ((i<11)?(i+1):(i+2)) +": " + typeTypes[i]+"</div>"
			ret += "<div>255: Min key</div>"
			ret += "<div>127: Max key</div>"
			return ret
		}})
		$(value).tooltip('enable')
	}
	else if(opVal == "$exists"){
		$(value).tooltip({'content':function(){return "<strong>True</strong> or <strong>False</strong>"}})
	}
	else{
		$(value).tooltip() //must be initalized before making sure it's disabled, otherwise it may cause an error
		$(value).tooltip('disable')
	}
}



//skip specifies how far to walk along the document before returning.  Used for paging
function query(skip, pageSize){
	if(skip == undefined)
		skip = 0
	var crits = $('#queryDiv').children('.oneCrit')
	var resultsDiv = $("#resultsDiv")
	var queryDic = {}
	for(var i=0;i<crits.length;i++){
		var curCrit = crits[i];
		var field = $(curCrit).attr('data-field')
		if(field == '' || field==undefined) // ignore if the field is blank
			continue
		var operation = $(curCrit).attr('data-operation')
		var value = $(curCrit).attr('data-value')
		for(var j in formats){
			var regex = formats[j][0]
			var conversion = formats[j][1]
			if(regex.test(value)){
				value = conversion(value)
				break;
			}
		}
		
		if(operation == '$eq')
			queryDic[field] = value
		else{
			if(!(field in queryDic))
				queryDic[field] = {}
			queryDic[field][operation] = value
		}
	}
	
	var data = {}
	data['dbName'] = dbName
	data['colName'] = colName
	data['query'] = queryDic
	data['limit'] = pageSize //limit number of results returned
	data['skip'] = skip
	if($('#sortField').val()){ //if a field was provide for sorting
		data['sortField'] = $('#sortField').val()
		data['sortDirection'] = Number($('#sortDirection').val())
	}
	data['geoSearch'] = $('#geosearch').is(":checked")
	if(data['geoSearch']){ //are we using the geospatial index?
		data['geoSearchX'] = $('#geosearchx').val()
		data['geoSearchY'] = $('#geosearchy').val()
	}
	$("#loadingResultsDiv").show()
	$.ajax({url:'/ajax/query', type:'POST', data:JSON.stringify(data), contentType:'application/json', success:queryReceived})
}

function queryReceived(data){
	$("#loadingResultsDiv").hide()
	$('#queryCount').html('Total Results: ' + data['count'])
	var results = data['results']
	var resultsDiv = $("#resultsDiv")
	$(resultsDiv).html('')
	for(var i=0;i<results.length;i++){
		var resultContainer = $('<div>', {'class':'resultContainer'})
		$(resultContainer).attr('data-loaded', false) //has the expanded doc been loaded yet?
		$(resultContainer).attr('data-expaned', false) //is the div currently expaned
		
		var divSummary = $('<div>', {'class':'resultSummary'})
		
		var doc = results[i]
		var img = $('<img>', {class:'operatorIcon', src:"/static/images/expandLogo.png",onclick:"javascript:toggleExpanded($(this).parent().parent())"})
		$(divSummary).append(img)
		$(divSummary).append('{')
		for(var j in doc){
			$(divSummary).append(j+':'+JSON.stringify(doc[j]))
			if(j=='_id'){
				$(resultContainer).attr('data-_id',JSON.stringify(doc[j]))
			}		
		}
		$(divSummary).append('}')
		var expanded = $('<div>', {'class':'resultExpanded','style':'display:none'})
		
		$(resultContainer).append(divSummary)
		$(resultContainer).append(expanded)
		$(resultsDiv).append(resultContainer)
		
		if(data['count'] == 1){ //if there's only result, then show it automatically
			loadDoc(resultContainer)
			$(resultContainer).attr('data-expaned', true)
			$(expanded).css('display','')
		}
	}

} //queryReceived

//loads the next page of the query
function nextPage(){
	
}

function toggleExpanded(div){
	var expanded = $(div).children('.resultExpanded')
	if(!$(div).data('loaded')){
		loadDoc(div, function(){expanded.hide();$(expanded).slideToggle()})
	}
	else
		$(expanded).slideToggle()
}

function loadDoc(div, callback){ //[optional] callback method runs when the document has been loaded successfully
	var data = {}
	data['dbName'] = dbName
	data['colName'] = colName
	data['objID'] = $(div).data('_id')
	var expand = $(div).children('.resultExpanded')
	expand.html("<img src = /static/images/loading.gif> Loading...")
	expand.show()
	$.ajax({url:'/ajax/loadDocument', type:'POST', data:JSON.stringify(data), contentType:'application/json', success:docReceived})
	
	function docReceived(data){
		$(expand).html('')
		var serialized = serializeDoc(data['doc'])
		var keys = Object.keys(serialized).sort() //get the keys sorted alphabetically
		for(var i=0;i<keys.length;i++){
			var curKey = keys[i]
			var newDiv = $("<div>", {'class':'oneAttr'})
			$(newDiv).append(curKey+': ')
			var val = $("<span>")
			$(val).append(JSON.stringify(convertValTypes(curKey, serialized[curKey])))
			formatValueDiv(val)
			$(newDiv).append(val)
			$(expand).append(newDiv)
		}
		$(div).data('loaded', true)
		if(callback) //if callback was set
			callback()
	}
	
	
}


function convertValTypes(field, value){
	//takes in a field an value and detects if the field needs to be specially formatted
	//conversion is done if necessary, if not, the exact same value is returned
	
	if(field.indexOf("$date") != -1){
		var date = new Date(0)
		date.setUTCSeconds(value/1000)
		return date
	}
	
	return value
}

function loadSchema(){
	var data = {}
	data['dbName'] = dbName
	data['colName'] = colName
	$.ajax({url:'/ajax/getschema', type:'POST', data:JSON.stringify(data), contentType:'application/json', success:schemaReceived})
	
	function schemaReceived(data){
		var schemaDiv = $("#schema")
		$(schemaDiv).html('')
		schema = data['schema']
		for(i=0;i<schema.length;i++){
			var curKey = schema[i]
			var newDiv = $("<div>", {'class':'oneKeyContainer'})
			$(newDiv).attr('data-field', curKey['_id']['key'])
			$(newDiv).click( function(){loadDistinctVals(this)})
			newDiv.append(curKey['_id']['key']+': ' + curKey['percentContaining']+"% (" + curKey['value']['type'] + ")") 
			$(schemaDiv).append(newDiv)
		}
	
	}
}

//used to format the text fields for values depending the type of value (Boolean, String, etc)
function formatValue(event){
	var input = event.target
	
}

//takes in a DIV containing a value and styles it according to it's type
function formatValueDiv(div){
	var val = $(div).html()
	if(val == "")
		val = $(div).val() //handle inputs as well, not just divs
	val = $.trim(val) //removing spaces on the ends
	$(div).removeClass(Object.keys(formats).join(' ')) //remove all previous styling
	var niceName = ""
	for(var i in formats){
		if(formats[i][0].test(val)){
			$(div).addClass(i)
			niceName = formats[i][2] //descriptive name
			break
		}
	}
	var indicatorDiv = $(div).parents('.oneCrit').find('.valTypeIndicator')
	var operatorVal = $(div).parents('.oneCrit').find('.operation').val()
	if(operatorVal == '$type') //custom valueType indicator value for $exists
		$(indicatorDiv).html('$type query: ' + typeTypes[Number(val)-1])
	else{
		if(niceName) //if we matched something
			$(indicatorDiv).html(niceName) //set the descriptive name
		else if (val) //the field is not blank but nothing was matched
			$(indicatorDiv).html("<span style='color:red'>Format does not match a type</span>")
		else // the field is just blank
			$(indicatorDiv).html("")
	}
	
}
//takes in a field value and retrieves the unique values for that field
function loadDistinctVals(event){
	data = {}
	var field = $(event.target).parent().attr('data-field')
	data['dbName'] = dbName
	data['colName'] = colName
	data['field'] = field
	$.ajax({url:'/ajax/loadDistinctVals', type:'POST', data:JSON.stringify(data), contentType:'application/json', success:valsReceived})
	
	function valsReceived(data){
		var fieldList = $('#fieldlist')
		$(fieldList).html(field)
		if(data['status'] == 'tooMany'){
			$(fieldList).append("<h2>Error more than "+data['limit']+" distinct values found.</h2>")
			return
		}
		var vals = data['vals']
		for(var i=0;i<vals.length;i++){
			var newDiv = $('<div>')
			newDiv.append(JSON.stringify(vals[i]))
			formatValueDiv(newDiv)
			$(fieldList).append(newDiv)
		}
	}
}

function toggleSchemaExpand(){
	var schema = $("#schema")
	var curHeight = schema.height(),
    autoHeight = schema.css('height', 'auto').height();
	if(schema.data('expanded')){
		schema.animate({'height':'200px'},1000)
		schema.data('expanded',false)
	}
	else{
		schema.height(curHeight).animate({height: autoHeight}, 1000);
		schema.data('expanded',true)
	}
}
